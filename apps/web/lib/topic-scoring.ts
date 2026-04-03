import { db, userModelConfig, getAvailableAiProviders, scoredTopics, selectTextModel } from '@techjm/db';
import { eq } from 'drizzle-orm';
import { flowProducer, QUEUE_NAMES } from '@/lib/queue-client';
import type { SubAgentJobData, ScoringOrchestratorJobData } from '@/lib/queue-client';

const AGENT_TYPES: SubAgentJobData['agentType'][] = [
  'sentiment',
  'audience_fit',
  'seo',
  'competitor_gap',
  'content_market_fit',
  'engagement_predictor',
  'pillar_balancer',
];

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
  xai: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  groq: 'llama-3.3-70b-versatile',
  openai_compatible: 'gpt-4o-mini',
};

type QueueScoringInput = {
  rawTopicId: string;
  scoredTopicId: string;
  discoveryRunId: string;
};

function normalizeScoringModel(provider: string, requestedModel?: string | null) {
  const requested = requestedModel?.trim();
  const safeDefault = DEFAULT_MODELS[provider] || 'gpt-4o-mini';

  if (!requested) {
    return safeDefault;
  }

  if (
    provider === 'openai' &&
    (/^gpt-3\.5/i.test(requested) ||
      /^gpt-4-(0314|0613|1106-preview|0125-preview)$/i.test(requested))
  ) {
    return safeDefault;
  }

  return requested;
}

export async function queueTopicScoring(
  userId: string,
  items: QueueScoringInput[],
) {
  if (items.length === 0) {
    return {
      queued: 0,
      provider: null,
      model: null,
    };
  }

  const modelConfig = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, userId),
  });

  const configuredModel = (modelConfig?.subAgentModel as { provider?: string; model?: string } | null) || null;
  const availableProviders = (await getAvailableAiProviders(userId)).filter(
    (provider) => provider.provider !== 'replicate',
  );

  const selectedProvider =
    configuredModel?.provider && configuredModel?.model
      ? {
          provider: configuredModel.provider,
          model: normalizeScoringModel(configuredModel.provider, configuredModel.model),
        }
      : availableProviders[0]
        ? {
            provider: availableProviders[0].provider,
            model: selectTextModel(
              availableProviders[0].provider,
              availableProviders[0].models,
              normalizeScoringModel(
                availableProviders[0].provider,
                availableProviders[0].models[0] ||
                  DEFAULT_MODELS[availableProviders[0].provider] ||
                  'gpt-4o-mini',
              ),
            ),
          }
        : null;

  if (!selectedProvider) {
    return {
      queued: 0,
      provider: null,
      model: null,
    };
  }

  let queued = 0;

  for (const item of items) {
    await db
      .update(scoredTopics)
      .set({ status: 'scoring' })
      .where(eq(scoredTopics.id, item.scoredTopicId));

    const childrenJobs = AGENT_TYPES.map((agentType) => ({
      name: `sub-agent-${item.scoredTopicId}-${agentType}`,
      queueName: QUEUE_NAMES.SUB_AGENT,
      data: {
        userId,
        rawTopicId: item.rawTopicId,
        scoredTopicId: item.scoredTopicId,
        agentType,
        provider: selectedProvider.provider,
        model: selectedProvider.model,
      } as SubAgentJobData,
      opts: {
        jobId: `sub-agent-${item.scoredTopicId}-${agentType}`,
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 15000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    }));

    await flowProducer.add({
      name: `orchestrator-${item.scoredTopicId}`,
      queueName: QUEUE_NAMES.SCORING_ORCHESTRATOR,
      data: {
        userId,
        scoredTopicId: item.scoredTopicId,
        rawTopicId: item.rawTopicId,
        discoveryRunId: item.discoveryRunId,
      } as ScoringOrchestratorJobData,
      children: childrenJobs,
      opts: {
        jobId: `orchestrator-${item.scoredTopicId}`,
        attempts: 1,
        removeOnComplete: { count: 200 },
      },
    });

    queued += 1;
  }

  return {
    queued,
    provider: selectedProvider.provider,
    model: selectedProvider.model,
  };
}
