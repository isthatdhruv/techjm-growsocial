import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import {
  db,
  userNicheProfiles,
  posts,
  rawTopics,
  fallbackGroundingCache,
  getActiveApiKey,
  getAvailableAiProviders,
  selectTextModel,
} from '@techjm/db';
import type { ProviderConfig } from '@techjm/db';
import { AdapterFactory, FallbackGroundingService } from '@techjm/ai-adapters';
import type { NicheContext, GroundingItem, AIProvider, DiscoveredTopic } from '@techjm/ai-adapters';
import { eq, and, desc, gt } from 'drizzle-orm';
import { connection } from '../../redis.js';
import { QUEUE_NAMES } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
import type { DiscoveryLLMJobData } from '../../queues.js';

const DISCOVERY_DEFAULT_MODELS: Partial<Record<AIProvider, string>> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
  xai: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  groq: 'llama-3.3-70b-versatile',
  openai_compatible: 'gpt-4o-mini',
};

function normalizeDiscoveryModel(provider: AIProvider, requestedModel: string, config: ProviderConfig): string {
  const candidateModels = config.models?.filter(Boolean) || [];
  const requested = requestedModel?.trim();
  const fallbackModel =
    selectTextModel(
      provider,
      candidateModels,
      DISCOVERY_DEFAULT_MODELS[provider] || requested || 'gpt-4o-mini',
    );

  if (!requested) {
    return fallbackModel;
  }

  if (provider === 'openai') {
    const unsupportedLegacyModel =
      /^gpt-3\.5/i.test(requested) ||
      /^gpt-4-(0314|0613|1106-preview|0125-preview)$/i.test(requested);

    if (unsupportedLegacyModel) {
      return fallbackModel;
    }
  }

  return selectTextModel(provider, candidateModels, requested);
}

function isRetryableDiscoveryError(error: unknown): boolean {
  const message = (error as { message?: string })?.message?.toLowerCase() || '';

  return (
    message.includes('tool') ||
    message.includes('not supported') ||
    message.includes('rate limit') ||
    message.includes('temporarily unavailable') ||
    message.includes('overloaded') ||
    message.includes('timed out')
  );
}

async function processDiscoveryLLM(job: Job<DiscoveryLLMJobData>) {
  const { userId, slotName, provider, model, discoveryRunId, focusQuery } = job.data;

  job.log(`Starting discovery: user=${userId}, slot=${slotName}, provider=${provider}, model=${model}${focusQuery ? `, focus="${focusQuery}"` : ''}`);

  // 1. Load user's niche config
  const nicheProfile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  });
  if (!nicheProfile) throw new Error(`No niche profile found for user ${userId}`);

  // 2. Load active providers (user key first, env fallback)
  const availableProviders = (await getAvailableAiProviders(userId)).filter(
    (candidate) => candidate.provider !== 'replicate',
  );
  const availableProviderMap = new Map(
    availableProviders.map((candidate) => [candidate.provider, candidate] as const),
  );

  const activeProvider =
    availableProviderMap.get(provider as AIProvider) ||
    (await getActiveApiKey(userId, provider as any));

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
    ...(focusQuery ? { focus_query: focusQuery } : {}),
    grounding_data: groundingData,
  };

  // 6. Call the adapter with automatic discovery-safe fallbacks
  const primaryProvider = provider as AIProvider;
  const preferredProviders = [
    activeProvider,
    ...availableProviders.filter((candidate) => candidate.provider !== primaryProvider),
  ];

  const candidateProviders = preferredProviders.sort((left, right) => {
    const leftSearch = left.capabilities.web_search ? 1 : 0;
    const rightSearch = right.capabilities.web_search ? 1 : 0;
    return rightSearch - leftSearch;
  });

  let topics: DiscoveredTopic[] | null = null;
  let selectedProvider = activeProvider;
  let selectedModel = normalizeDiscoveryModel(primaryProvider, model, activeProvider);
  const attemptErrors: string[] = [];

  for (const candidate of candidateProviders) {
    const candidateProvider = candidate.provider as AIProvider;
    const candidateModel = normalizeDiscoveryModel(
      candidateProvider,
      candidate.provider === primaryProvider ? model : candidate.models[0] || '',
      candidate,
    );

    const adapter = AdapterFactory.getAdapter(candidateProvider, {
      baseUrl: candidate.baseUrl,
    });

    job.log(
      `Discovery attempt with provider=${candidateProvider}, model=${candidateModel}${candidateProvider === primaryProvider ? ' (primary)' : ' (fallback)'}`,
    );

    try {
      const result = await adapter.discoverTopics(candidate.apiKey, candidateModel, context);
      if (result.length === 0) {
        attemptErrors.push(`${candidateProvider}:${candidateModel}: returned 0 topics`);
        continue;
      }

      topics = result;
      selectedProvider = candidate;
      selectedModel = candidateModel;
      job.log(`Adapter returned ${result.length} topics using ${candidateProvider}/${candidateModel}`);
      break;
    } catch (error: any) {
      const message = error?.message || 'Unknown provider error';
      attemptErrors.push(`${candidateProvider}:${candidateModel}: ${message}`);
      job.log(`Discovery attempt failed for ${candidateProvider}/${candidateModel}: ${message}`);

      if (error.status === 401 || message.includes('Incorrect API key')) {
        throw new Error(
          `INVALID_KEY: API key for ${candidateProvider} is invalid or expired. User needs to re-validate in settings.`,
        );
      }

      if (!isRetryableDiscoveryError(error)) {
        throw new Error(`PROVIDER_ERROR: ${candidateProvider} returned error: ${message}`);
      }
    }
  }

  if (!topics) {
    throw new Error(
      `PROVIDER_ERROR: discovery failed for all providers. Attempts: ${attemptErrors.join(' | ')}`,
    );
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
      provider: selectedProvider.provider as any,
      model: selectedModel,
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
    provider: selectedProvider.provider,
    model: selectedModel,
    topicsFound: validTopics.length,
    discoveryRunId,
    hasWebSearch: AdapterFactory.hasWebSearch(selectedProvider.provider as AIProvider),
    usedFallback: selectedProvider.provider !== primaryProvider || selectedModel !== model || !hasWebSearch,
  };
}

export const discoveryLLMWorker = new Worker(QUEUE_NAMES.DISCOVERY_LLM, withErrorHandling(QUEUE_NAMES.DISCOVERY_LLM, processDiscoveryLLM), {
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
