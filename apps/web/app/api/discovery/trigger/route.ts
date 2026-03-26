import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, userModelConfig, userAiKeys, userNicheProfiles } from '@techjm/db';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { AIProvider } from '@techjm/ai-adapters';
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

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.onboardingStep !== 'complete') {
      return NextResponse.json(
        { error: 'Complete onboarding before running discovery' },
        { status: 400 },
      );
    }

    // Load model config and AI keys
    const [config] = await db
      .select()
      .from(userModelConfig)
      .where(eq(userModelConfig.userId, user.id))
      .limit(1);

    if (!config) {
      return NextResponse.json({ error: 'No model configuration found' }, { status: 400 });
    }

    const aiKeys = await db
      .select()
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, user.id));

    if (aiKeys.length === 0) {
      return NextResponse.json({ error: 'No AI provider keys configured' }, { status: 400 });
    }

    // Build valid slots
    const keyProviders: Set<string> = new Set(aiKeys.map((k) => k.provider));
    const slots: { name: 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d'; config: SlotConfig }[] = [];

    if (config.slotA) slots.push({ name: 'slot_a', config: config.slotA as SlotConfig });
    if (config.slotB) slots.push({ name: 'slot_b', config: config.slotB as SlotConfig });
    if (config.slotC) slots.push({ name: 'slot_c', config: config.slotC as SlotConfig });
    if (config.slotD) slots.push({ name: 'slot_d', config: config.slotD as SlotConfig });

    const validSlots = slots.filter((s) => keyProviders.has(s.config.provider));

    if (validSlots.length === 0) {
      return NextResponse.json(
        { error: 'No discovery slots have matching API keys' },
        { status: 400 },
      );
    }

    // Check if any slot uses a non-web provider → trigger fallback grounding first
    const needsFallback = validSlots.some(
      (s) => !AdapterFactory.hasWebSearch(s.config.provider as AIProvider),
    );

    if (needsFallback) {
      const [nicheProfile] = await db
        .select()
        .from(userNicheProfiles)
        .where(eq(userNicheProfiles.userId, user.id))
        .limit(1);

      if (nicheProfile) {
        await fallbackGroundingQueue.add('manual-grounding', {
          niches: [nicheProfile.niche],
        });
      }
    }

    // Queue discovery flow
    const discoveryRunId = uuidv4();

    const childrenJobs: FlowJob[] = validSlots.map((slot) => ({
      name: `discovery-${user.id}-${slot.name}`,
      queueName: QUEUE_NAMES.DISCOVERY_LLM,
      data: {
        userId: user.id,
        slotName: slot.name,
        provider: slot.config.provider,
        model: slot.config.model,
        discoveryRunId,
      } satisfies DiscoveryLLMJobData,
      opts: {
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
      } satisfies DiscoveryMergeJobData,
      children: childrenJobs,
      opts: {
        attempts: 1,
        removeOnComplete: { count: 100 },
      },
    });

    return NextResponse.json({
      success: true,
      discoveryRunId,
      slotsQueued: validSlots.length,
    });
  } catch (err) {
    console.error('Discovery trigger error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
