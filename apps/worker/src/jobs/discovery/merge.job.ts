import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { db, rawTopics, scoredTopics, userModelConfig, userAiKeys } from '@techjm/db';
import { eq, and, isNotNull } from 'drizzle-orm';
import { compareTwoStrings } from 'string-similarity';
import { connection } from '../../redis.js';
import { QUEUE_NAMES, flowProducer } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
import type { DiscoveryMergeJobData, SubAgentJobData, ScoringOrchestratorJobData } from '../../queues.js';
import { getAutoSelectedModel } from '../sub-agents/model-selector.js';

// Similarity threshold for fuzzy dedup
const DEDUP_THRESHOLD = 0.65;

const CONSENSUS_TIERS = {
  4: { tier: 'definitive' as const, multiplier: 2.0 },
  3: { tier: 'strong' as const, multiplier: 1.75 },
  2: { tier: 'confirmed' as const, multiplier: 1.5 },
  1: { tier: 'experimental' as const, multiplier: 1.0 },
} as const;

type RawTopic = typeof rawTopics.$inferSelect;

interface TopicCluster {
  canonical: RawTopic;
  duplicates: RawTopic[];
  allSourceUrls: string[];
  allXPostUrls: string[];
  consensusCount: number;
  slots: string[];
}

async function processDiscoveryMerge(job: Job<DiscoveryMergeJobData>) {
  const { userId, discoveryRunId } = job.data;

  job.log(`Starting merge for user=${userId}, run=${discoveryRunId}`);

  // 1. Load all raw topics from this discovery run
  const allTopics = await db
    .select()
    .from(rawTopics)
    .where(and(eq(rawTopics.userId, userId), eq(rawTopics.discoveryRunId, discoveryRunId)));

  const slotCount = new Set(allTopics.map((t) => t.sourceLlm)).size;
  job.log(`Loaded ${allTopics.length} raw topics from ${slotCount} slots`);

  if (allTopics.length === 0) {
    job.log('No topics found — all LLM slots returned empty. Check API keys and provider status.');
    return { merged: 0, total: 0 };
  }

  // 2. Fuzzy dedup + clustering
  const clusters: TopicCluster[] = [];

  for (const topic of allTopics) {
    let foundCluster = false;

    for (const cluster of clusters) {
      const titleSim = compareTwoStrings(
        topic.title.toLowerCase(),
        cluster.canonical.title.toLowerCase(),
      );

      const angleSim =
        topic.angle && cluster.canonical.angle
          ? compareTwoStrings(topic.angle.toLowerCase(), cluster.canonical.angle.toLowerCase())
          : 0;

      // Weighted: title matters more
      const combinedSim = titleSim * 0.7 + angleSim * 0.3;

      if (combinedSim >= DEDUP_THRESHOLD) {
        cluster.duplicates.push(topic);
        cluster.consensusCount++;
        cluster.slots.push(topic.sourceLlm);

        // Merge source URLs
        const newSourceUrls = (topic.sourceUrls as string[]) || [];
        cluster.allSourceUrls = [...new Set([...cluster.allSourceUrls, ...newSourceUrls])];

        // Merge X post URLs
        const newXUrls = (topic.xPostUrls as string[]) || [];
        cluster.allXPostUrls = [...new Set([...cluster.allXPostUrls, ...newXUrls])];

        // Pick "best" canonical: prefer longer angle (more detail)
        if (
          topic.angle &&
          (!cluster.canonical.angle || topic.angle.length > cluster.canonical.angle.length)
        ) {
          cluster.duplicates.push(cluster.canonical);
          cluster.canonical = topic;
        }

        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({
        canonical: topic,
        duplicates: [],
        allSourceUrls: (topic.sourceUrls as string[]) || [],
        allXPostUrls: (topic.xPostUrls as string[]) || [],
        consensusCount: 1,
        slots: [topic.sourceLlm],
      });
    }
  }

  job.log(`Dedup: ${allTopics.length} raw → ${clusters.length} unique clusters`);

  // 3. Cross-reference source URLs (informational logging)
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const sharedUrls = clusters[i].allSourceUrls.filter((url) =>
        clusters[j].allSourceUrls.includes(url),
      );
      if (sharedUrls.length > 0) {
        job.log(
          `URL cross-ref: "${clusters[i].canonical.title}" and "${clusters[j].canonical.title}" share ${sharedUrls.length} source URLs`,
        );
      }
    }
  }

  // 4. Assign consensus tiers and update DB
  for (const cluster of clusters) {
    const tierKey = Math.min(cluster.consensusCount, 4) as keyof typeof CONSENSUS_TIERS;
    const tierInfo = CONSENSUS_TIERS[tierKey];

    // Update the canonical topic
    await db
      .update(rawTopics)
      .set({
        consensusCount: cluster.consensusCount,
        consensusTier: tierInfo.tier,
        sourceUrls: cluster.allSourceUrls,
        xPostUrls: cluster.allXPostUrls.length > 0 ? cluster.allXPostUrls : null,
      })
      .where(eq(rawTopics.id, cluster.canonical.id));

    // Delete duplicates to keep raw_topics clean
    for (const dup of cluster.duplicates) {
      await db.delete(rawTopics).where(eq(rawTopics.id, dup.id));
    }
  }

  // 5. Summary
  const tierSummary = clusters.reduce(
    (acc, c) => {
      const tierKey = Math.min(c.consensusCount, 4) as keyof typeof CONSENSUS_TIERS;
      const tier = CONSENSUS_TIERS[tierKey].tier;
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  job.log(`Merge complete: ${clusters.length} unique topics`);
  job.log(`Consensus tiers: ${JSON.stringify(tierSummary)}`);

  // 6. Sort by consensus and log top topics
  const sorted = clusters.sort((a, b) => b.consensusCount - a.consensusCount);
  sorted.slice(0, 5).forEach((c, i) => {
    const tierKey = Math.min(c.consensusCount, 4) as keyof typeof CONSENSUS_TIERS;
    job.log(
      `Top ${i + 1}: [${CONSENSUS_TIERS[tierKey].tier}] "${c.canonical.title}" (${c.slots.join(', ')})`,
    );
  });

  // ═══ Phase 6: Auto-trigger sub-agent scoring for each surviving topic ═══
  const survivingTopics = await db
    .select()
    .from(rawTopics)
    .where(
      and(
        eq(rawTopics.userId, userId),
        eq(rawTopics.discoveryRunId, discoveryRunId),
        isNotNull(rawTopics.consensusTier),
      ),
    );

  job.log(`Queueing sub-agent scoring for ${survivingTopics.length} topics`);

  // Determine which model to use for sub-agent analysis
  const modelConfig = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, userId),
  });

  const subAgentModelConfig = (modelConfig?.subAgentModel as { provider: string; model: string }) || null;
  const autoModel = subAgentModelConfig || (await getAutoSelectedModel(userId, 'sub_agent'));

  if (!autoModel) {
    job.log('WARNING: No AI provider available for sub-agent scoring. Skipping scoring.');
    return {
      totalRaw: allTopics.length,
      uniqueAfterMerge: clusters.length,
      tierBreakdown: tierSummary,
      topTopics: sorted.slice(0, 5).map((c) => ({
        title: c.canonical.title,
        consensus: c.consensusCount,
        slots: c.slots,
      })),
      scoringQueued: 0,
    };
  }

  const agentTypes: SubAgentJobData['agentType'][] = [
    'sentiment',
    'audience_fit',
    'seo',
    'competitor_gap',
    'content_market_fit',
    'engagement_predictor',
    'pillar_balancer',
  ];

  let scoringQueued = 0;

  for (const rawTopic of survivingTopics) {
    const tierKey = Math.min(rawTopic.consensusCount || 1, 4) as keyof typeof CONSENSUS_TIERS;
    const multiplier = CONSENSUS_TIERS[tierKey].multiplier;

    // Pre-create a scored_topics row with status='scoring'
    const [scoredRow] = await db
      .insert(scoredTopics)
      .values({
        rawTopicId: rawTopic.id,
        userId,
        status: 'scoring',
        consensusMultiplier: multiplier.toString(),
      })
      .returning({ id: scoredTopics.id });

    // Queue orchestrator as parent, 7 sub-agents as children (FlowProducer)
    const childrenJobs = agentTypes.map((agentType) => ({
      name: `sub-agent-${scoredRow.id}-${agentType}`,
      queueName: QUEUE_NAMES.SUB_AGENT,
      data: {
        userId,
        rawTopicId: rawTopic.id,
        scoredTopicId: scoredRow.id,
        agentType,
        provider: autoModel.provider,
        model: autoModel.model,
      } as SubAgentJobData,
      opts: {
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 15000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    }));

    await flowProducer.add({
      name: `orchestrator-${scoredRow.id}`,
      queueName: QUEUE_NAMES.SCORING_ORCHESTRATOR,
      data: {
        userId,
        scoredTopicId: scoredRow.id,
        rawTopicId: rawTopic.id,
        discoveryRunId,
      } as ScoringOrchestratorJobData,
      children: childrenJobs,
      opts: { attempts: 1, removeOnComplete: { count: 200 } },
    });

    scoringQueued++;
  }

  job.log(
    `Queued ${scoringQueued} orchestrator flows (${scoringQueued * 7} sub-agent jobs) using ${autoModel.provider}/${autoModel.model}`,
  );

  return {
    totalRaw: allTopics.length,
    uniqueAfterMerge: clusters.length,
    tierBreakdown: tierSummary,
    topTopics: sorted.slice(0, 5).map((c) => ({
      title: c.canonical.title,
      consensus: c.consensusCount,
      slots: c.slots,
    })),
    scoringQueued,
  };
}

export const discoveryMergeWorker = new Worker(
  QUEUE_NAMES.DISCOVERY_MERGE,
  withErrorHandling(QUEUE_NAMES.DISCOVERY_MERGE, processDiscoveryMerge),
  { connection, concurrency: 4 },
);

discoveryMergeWorker.on('failed', (job, err) => {
  console.error(`[discovery-merge] Job ${job?.id} failed:`, err.message);
});
