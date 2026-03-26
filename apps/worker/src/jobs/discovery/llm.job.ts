import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { db, userNicheProfiles, userAiKeys, posts, rawTopics, fallbackGroundingCache } from '@techjm/db';
import { decryptApiKey } from '@techjm/db';
import { AdapterFactory, FallbackGroundingService } from '@techjm/ai-adapters';
import type { NicheContext, GroundingItem, AIProvider } from '@techjm/ai-adapters';
import { eq, and, desc, gt } from 'drizzle-orm';
import { connection } from '../../redis.js';
import { QUEUE_NAMES } from '../../queues.js';
import type { DiscoveryLLMJobData } from '../../queues.js';

async function processDiscoveryLLM(job: Job<DiscoveryLLMJobData>) {
  const { userId, slotName, provider, model, discoveryRunId } = job.data;

  job.log(`Starting discovery: user=${userId}, slot=${slotName}, provider=${provider}, model=${model}`);

  // 1. Load user's niche config
  const nicheProfile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  });
  if (!nicheProfile) throw new Error(`No niche profile found for user ${userId}`);

  // 2. Load user's API key for this provider
  const keyRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, provider as any)),
  });
  if (!keyRecord) throw new Error(`No API key found for provider ${provider}, user ${userId}`);

  const apiKey = decryptApiKey(keyRecord.apiKeyEnc);

  // 3. Load recent post titles (avoid repeats)
  const recentPosts = await db.query.posts.findMany({
    where: eq(posts.userId, userId),
    orderBy: [desc(posts.createdAt)],
    limit: 10,
    columns: { caption: true },
  });
  const recentTopics = recentPosts.map((p) => p.caption?.slice(0, 100) || '').filter(Boolean);

  // 4. Check if this provider needs fallback grounding
  const hasWebSearch = AdapterFactory.hasWebSearch(provider as AIProvider);
  let groundingData: GroundingItem[] | undefined;

  if (!hasWebSearch) {
    job.log(`Provider ${provider} has no web search — loading fallback grounding data`);

    const cached = await db
      .select()
      .from(fallbackGroundingCache)
      .where(gt(fallbackGroundingCache.expiresAt, new Date()));

    if (cached.length > 0) {
      groundingData = cached.flatMap((c) => c.data as GroundingItem[]);
      job.log(`Loaded ${groundingData.length} grounding items from cache`);
    } else {
      // Cache is empty/expired — collect fresh (safety net)
      job.log('Cache empty — collecting fresh grounding data');
      const groundingService = new FallbackGroundingService();
      groundingData = await groundingService.collect(nicheProfile.niche);
      job.log(`Collected ${groundingData.length} fresh grounding items`);
    }
  }

  // 5. Build niche context
  const context: NicheContext = {
    niche: nicheProfile.niche,
    pillars: (nicheProfile.pillars as string[]) || [],
    audience: nicheProfile.audience,
    tone: nicheProfile.tone,
    competitors: (nicheProfile.competitors as { handle: string; platform: string }[]) || [],
    anti_topics: (nicheProfile.antiTopics as string[]) || [],
    recent_topics: recentTopics,
    grounding_data: groundingData,
  };

  // 6. Call the adapter
  const adapter = AdapterFactory.getAdapter(provider as AIProvider);

  let topics;
  try {
    topics = await adapter.discoverTopics(apiKey, model, context);
    job.log(`Adapter returned ${topics.length} topics`);
  } catch (error: any) {
    if (error.status === 401 || error.message?.includes('Incorrect API key')) {
      throw new Error(
        `INVALID_KEY: API key for ${provider} is invalid or expired. User needs to re-validate in settings.`,
      );
    }
    if (error.status === 429) {
      throw new Error(`RATE_LIMITED: ${provider} rate limit hit. Will retry with backoff.`);
    }
    throw new Error(`PROVIDER_ERROR: ${provider} returned error: ${error.message}`);
  }

  // 7. Validate and clean topics
  const validTopics = topics
    .filter((t) => {
      if (!t.title || t.title.trim().length === 0) return false;
      if (!t.source_urls || t.source_urls.length === 0) {
        job.log(`Warning: topic "${t.title}" has no source URLs`);
      }
      return true;
    })
    .slice(0, 10); // Cap at 10 topics per slot

  // 8. Save to raw_topics table
  if (validTopics.length > 0) {
    const topicRows = validTopics.map((t) => ({
      userId,
      sourceLlm: slotName,
      provider: provider as any,
      model,
      title: t.title,
      angle: t.angle || null,
      reasoning: t.why_timely || null,
      sourceUrls: t.source_urls || [],
      xPostUrls: t.x_post_urls || null,
      xEngagement: t.x_engagement || null,
      consensusCount: 1,
      controversyLevel: t.controversy_level || null,
      suggestedPlatform: t.suggested_platform || null,
      discoveryRunId,
      fetchedAt: new Date(),
    }));

    await db.insert(rawTopics).values(topicRows);
    job.log(`Saved ${topicRows.length} topics to raw_topics`);
  }

  // 9. Return summary for the merge job
  return {
    userId,
    slotName,
    provider,
    model,
    topicsFound: validTopics.length,
    discoveryRunId,
    hasWebSearch,
    usedFallback: !hasWebSearch,
  };
}

export const discoveryLLMWorker = new Worker(QUEUE_NAMES.DISCOVERY_LLM, processDiscoveryLLM, {
  connection,
  concurrency: 8, // 2 users × 4 slots
  limiter: {
    max: 20, // Max 20 jobs per minute
    duration: 60000,
  },
});

discoveryLLMWorker.on('failed', (job, err) => {
  console.error(`[discovery-llm] Job ${job?.id} failed:`, err.message);
});
