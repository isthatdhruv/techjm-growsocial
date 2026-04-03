import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { withRateLimit } from '@/lib/rate-limit';
import {
  db,
  users,
  userModelConfig,
  userNicheProfiles,
  getAvailableAiProviders,
  selectTextModel,
} from '@techjm/db';
import type { SupportedAIProvider } from '@techjm/db';
import { hasWebSearchProvider } from '@/lib/ai-provider';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  flowProducer,
  fallbackGroundingQueue,
  QUEUE_NAMES,
} from '@/lib/queue-client';
import type { FlowJob } from 'bullmq';
import type { DiscoveryLLMJobData, DiscoveryMergeJobData } from '@/lib/queue-client';

export const dynamic = 'force-dynamic';

interface SlotConfig {
  provider: string;
  model: string;
}

const DEFAULT_DISCOVERY_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
  xai: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  groq: 'llama-3.3-70b-versatile',
  openai_compatible: 'gpt-4o-mini',
};

function normalizeDiscoverySlotModel(provider: string, requestedModel?: string | null) {
  const requested = requestedModel?.trim();
  const safeDefault = DEFAULT_DISCOVERY_MODELS[provider] || 'gpt-4o-mini';

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

  return selectTextModel(provider as SupportedAIProvider, [], requested);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResponse = await withRateLimit(user.id, 'discovery:trigger');
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json().catch(() => ({}));
    const focusQuery = String(body?.query || '').trim();
    console.info(
      `[discovery/trigger] start user=${user.id} focus=${focusQuery ? `"${focusQuery}"` : 'none'}`,
    );

    const [nicheProfile] = await db
      .select()
      .from(userNicheProfiles)
      .where(eq(userNicheProfiles.userId, user.id))
      .limit(1);

    if (!nicheProfile) {
      return NextResponse.json(
        { error: 'Set your niche before running discovery.' },
        { status: 400 },
      );
    }

    // Load model config and AI keys
    const [config] = await db
      .select()
      .from(userModelConfig)
      .where(eq(userModelConfig.userId, user.id))
      .limit(1);

    const availableProviders = await getAvailableAiProviders(user.id);
    if (availableProviders.length === 0) {
      return NextResponse.json(
        { error: 'No AI providers are configured. Add a user key or set a default key in .env.' },
        { status: 400 },
      );
    }

    if (user.onboardingStep !== 'complete') {
      await db
        .update(users)
        .set({ onboardingStep: 'complete', updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    // Build valid slots
    const textProviders = availableProviders.filter((provider) => provider.provider !== 'replicate');
    const providerMap = new Map(textProviders.map((provider) => [provider.provider, provider] as const));
    const keyProviders: Set<string> = new Set(textProviders.map((provider) => provider.provider));
    const slots: { name: 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d'; config: SlotConfig }[] = [];

    if (config?.slotA) slots.push({ name: 'slot_a', config: config.slotA as SlotConfig });
    if (config?.slotB) slots.push({ name: 'slot_b', config: config.slotB as SlotConfig });
    if (config?.slotC) slots.push({ name: 'slot_c', config: config.slotC as SlotConfig });
    if (config?.slotD) slots.push({ name: 'slot_d', config: config.slotD as SlotConfig });

    const configuredOrFallbackSlots = slots.length > 0 ? slots : textProviders.slice(0, 4).map((provider, index) => ({
      name: (`slot_${String.fromCharCode(97 + index)}`) as 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d',
      config: {
        provider: provider.provider,
        model: selectTextModel(provider.provider, provider.models, provider.models[0] || 'gpt-4o-mini'),
      },
    }));

    let validSlots = configuredOrFallbackSlots.filter((s) => keyProviders.has(s.config.provider));
    if (validSlots.length === 0) {
      validSlots = textProviders.slice(0, 4).map((provider, index) => ({
        name: (`slot_${String.fromCharCode(97 + index)}`) as 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d',
        config: {
          provider: provider.provider,
          model: selectTextModel(provider.provider, provider.models, provider.models[0] || 'gpt-4o-mini'),
        },
      }));
    }

    validSlots = validSlots.map((slot) => ({
      ...slot,
      config: {
        ...slot.config,
        model: selectTextModel(
          slot.config.provider as SupportedAIProvider,
          providerMap.get(slot.config.provider)?.models || [],
          normalizeDiscoverySlotModel(slot.config.provider, slot.config.model),
        ),
      },
    }));

    if (validSlots.length === 0) {
      return NextResponse.json(
        { error: 'No discovery slots have matching API keys' },
        { status: 400 },
      );
    }

    console.info(
      `[discovery/trigger] resolved user=${user.id} slots=${validSlots.length} providers=${validSlots.map((slot) => slot.config.provider).join(',')}`,
    );

    // Check if any slot uses a non-web provider → trigger fallback grounding first
    const needsFallback = validSlots.some(
      (s) => !hasWebSearchProvider(s.config.provider),
    );

    if (needsFallback) {
      await fallbackGroundingQueue.add('manual-grounding', {
        niches: [nicheProfile.niche],
      });
    }

    // Queue discovery flow
    const discoveryRunId = uuidv4();
    const mergeJobId = `merge-${discoveryRunId}`;

    const childrenJobs: FlowJob[] = validSlots.map((slot) => ({
      name: `discovery-${user.id}-${slot.name}`,
      queueName: QUEUE_NAMES.DISCOVERY_LLM,
      data: {
        userId: user.id,
        slotName: slot.name,
        provider: slot.config.provider,
        model: slot.config.model,
        discoveryRunId,
        ...(focusQuery ? { focusQuery } : {}),
      } satisfies DiscoveryLLMJobData,
      opts: {
        jobId: `discovery-${discoveryRunId}-${slot.name}`,
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 30000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    }));

    await flowProducer.add({
      name: `merge-${user.id}-${discoveryRunId}`,
      queueName: QUEUE_NAMES.DISCOVERY_MERGE,
      data: {
        userId: user.id,
        discoveryRunId,
        slotsTotal: validSlots.length,
      } satisfies DiscoveryMergeJobData,
      children: childrenJobs,
      opts: {
        jobId: mergeJobId,
        attempts: 1,
        removeOnComplete: { count: 100 },
      },
    });

    return NextResponse.json({
      success: true,
      discoveryRunId,
      mergeJobId,
      slotsQueued: validSlots.length,
      focusQuery: focusQuery || null,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[discovery/trigger] failed: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
