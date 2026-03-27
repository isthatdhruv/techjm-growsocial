import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { db, rawTopics, scoredTopics, userNicheProfiles, userAiKeys, posts, topicPerformance } from '@techjm/db';
import { decrypt } from '@techjm/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { SubAgentType, NicheContext } from '@techjm/ai-adapters';
import { connection } from '../../redis.js';
import { QUEUE_NAMES } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
import type { SubAgentJobData } from '../../queues.js';

// Import prompt builders (for enhanced prompts used in fallback path)
import { buildSentimentPrompt } from './prompts/sentiment.js';
import { buildAudienceFitPrompt } from './prompts/audience-fit.js';
import { buildSEOPrompt } from './prompts/seo.js';
import { buildCompetitorGapPrompt } from './prompts/competitor-gap.js';
import { buildContentMarketFitPrompt } from './prompts/content-market-fit.js';
import { buildEngagementPredictorPrompt } from './prompts/engagement-predictor.js';
import { buildPillarBalancerPrompt } from './prompts/pillar-balancer.js';

async function processSubAgent(job: Job<SubAgentJobData>) {
  const { userId, rawTopicId, scoredTopicId, agentType, provider, model } = job.data;

  job.log(`Sub-agent ${agentType}: topic=${rawTopicId}, provider=${provider}, model=${model}`);

  // 1. Load topic data
  const topic = await db.query.rawTopics.findFirst({
    where: eq(rawTopics.id, rawTopicId),
  });
  if (!topic) throw new Error(`Topic ${rawTopicId} not found`);

  // 2. Load niche profile
  const nicheProfile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  });
  if (!nicheProfile) throw new Error(`Niche profile not found for user ${userId}`);

  // 3. Load API key
  const keyRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, provider as any)),
  });
  if (!keyRecord) throw new Error(`No API key for ${provider}`);
  const apiKey = decrypt(keyRecord.apiKeyEnc);

  // 4. Build niche context for adapter
  const nicheContext: NicheContext = {
    niche: nicheProfile.niche,
    pillars: (nicheProfile.pillars as string[]) || [],
    audience: nicheProfile.audience,
    tone: nicheProfile.tone,
    competitors: (nicheProfile.competitors as { handle: string; platform: string }[]) || [],
    anti_topics: (nicheProfile.antiTopics as string[]) || [],
    recent_topics: [],
  };

  const topicData = {
    title: topic.title,
    angle: topic.angle || '',
    source_urls: (topic.sourceUrls as string[]) || [],
    x_post_urls: (topic.xPostUrls as string[]) || [],
    why_timely: topic.reasoning || '',
    controversy_level: topic.controversyLevel || 3,
    suggested_platform: (topic.suggestedPlatform as 'linkedin' | 'x' | 'both') || 'both',
  };

  // 5. Build historical data for engagement predictor
  let historicalData: any = undefined;
  if (agentType === 'engagement_predictor') {
    const avgEngagement = await db
      .select({
        avg_likes: sql<number>`coalesce(avg(${topicPerformance.likes}), 0)`,
        avg_comments: sql<number>`coalesce(avg(${topicPerformance.comments}), 0)`,
        avg_shares: sql<number>`coalesce(avg(${topicPerformance.shares}), 0)`,
      })
      .from(topicPerformance)
      .innerJoin(posts, eq(topicPerformance.postId, posts.id))
      .where(and(eq(posts.userId, userId), eq(topicPerformance.checkpoint, '48h')));

    if (avgEngagement[0] && Number(avgEngagement[0].avg_likes) > 0) {
      historicalData = {
        avg_likes: Math.round(Number(avgEngagement[0].avg_likes)),
        avg_comments: Math.round(Number(avgEngagement[0].avg_comments)),
        avg_shares: Math.round(Number(avgEngagement[0].avg_shares)),
      };
    }
  }

  // 6. Call the adapter's analyzeSubAgent method
  const adapter = AdapterFactory.getAdapter(provider as any);
  const subAgentResult = await adapter.analyzeSubAgent(
    apiKey,
    model,
    topicData,
    agentType as SubAgentType,
    nicheContext,
    historicalData,
  );

  let result = subAgentResult.scores;

  // 7. Parse result if it's a string
  if (typeof result === 'string') {
    try {
      const cleaned = (result as string).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      job.log(`WARNING: Could not parse sub-agent result as JSON: ${String(result).slice(0, 200)}`);
      result = {};
    }
  }

  // 8. Update scored_topics with this agent's results
  const updateData: Record<string, any> = {};

  switch (agentType) {
    case 'sentiment':
      updateData.sentimentScore = String(result.sentiment_score ?? 0);
      updateData.sentimentRiskFlag = result.risk_flag ?? false;
      break;
    case 'audience_fit':
      updateData.audienceFitScore = String(result.audience_fit_score ?? 5);
      updateData.audiencePersonas = result.persona_match || result.personas || [];
      break;
    case 'seo':
      updateData.seoScore = String(result.seo_score ?? 5);
      updateData.seoHashtags = [
        ...((result.hashtags_linkedin as string[]) || []),
        ...((result.hashtags_x as string[]) || []),
        ...((result.hashtags as string[]) || []),
      ];
      updateData.seoKeywords = result.keywords || [];
      break;
    case 'competitor_gap':
      updateData.competitorGapScore = String(result.competitor_gap_score ?? 5);
      updateData.competitorDiffAngle = result.differentiation_angle || result.diff_angle || null;
      break;
    case 'content_market_fit':
      updateData.cmfScore = String(result.cmf_score ?? 5);
      updateData.cmfLinkedService = result.linked_service || null;
      updateData.cmfCtaNatural = result.cta_natural ?? false;
      break;
    case 'engagement_predictor':
      updateData.engagementPredLikes = result.predicted_likes ?? 0;
      updateData.engagementPredComments = result.predicted_comments ?? 0;
      updateData.engagementPredConfidence = String(result.confidence ?? 0.5);
      break;
    case 'pillar_balancer':
      updateData.pillarBoost = String(result.pillar_boost ?? 1.0);
      break;
  }

  // Store full raw output in sub_agent_outputs JSONB (merge with existing)
  const currentScored = await db.query.scoredTopics.findFirst({
    where: eq(scoredTopics.id, scoredTopicId),
    columns: { subAgentOutputs: true },
  });

  const existingOutputs = (currentScored?.subAgentOutputs as Record<string, any>) || {};
  existingOutputs[agentType] = result;
  updateData.subAgentOutputs = existingOutputs;

  await db.update(scoredTopics).set(updateData).where(eq(scoredTopics.id, scoredTopicId));

  job.log(`Sub-agent ${agentType} complete: ${JSON.stringify(updateData).slice(0, 200)}`);

  return { agentType, scoredTopicId, resultKeys: Object.keys(result) };
}

export const subAgentWorker = new Worker(QUEUE_NAMES.SUB_AGENT, withErrorHandling('sub-agent', processSubAgent), {
  connection,
  concurrency: 14, // Process up to 14 sub-agent jobs in parallel (2 topics x 7 agents)
  limiter: {
    max: 40, // Max 40 LLM calls per minute across all sub-agents
    duration: 60000,
  },
});

subAgentWorker.on('failed', (job, err) => {
  console.error(
    `[sub-agent] Job failed: ${job?.data?.agentType} for topic ${job?.data?.rawTopicId}`,
    err.message,
  );
});
