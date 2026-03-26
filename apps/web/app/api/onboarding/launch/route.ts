import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, users, userNicheProfiles, userAiKeys, userModelConfig } from '@techjm/db';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { AIProvider } from '@techjm/ai-adapters';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { FlowJob } from 'bullmq';
import {
  flowProducer,
  fallbackGroundingQueue,
  QUEUE_NAMES,
} from '@/lib/queue-client';
import type { DiscoveryLLMJobData, DiscoveryMergeJobData } from '@/lib/queue-client';

interface SlotConfig {
  provider: string;
  model: string;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify steps 1-4 are complete
    const [nicheProfile] = await db
      .select()
      .from(userNicheProfiles)
      .where(eq(userNicheProfiles.userId, user.id))
      .limit(1);

    if (!nicheProfile) {
      return NextResponse.json(
        { error: 'Niche profile not configured. Please complete Step 2.' },
        { status: 400 },
      );
    }

    const aiKeys = await db
      .select()
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, user.id));

    if (aiKeys.length === 0) {
      return NextResponse.json(
        { error: 'No AI provider keys configured. Please complete Step 3.' },
        { status: 400 },
      );
    }

    // Mark onboarding as complete
    await db
      .update(users)
      .set({ onboardingStep: 'complete', updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Queue first discovery run
    let discoveryRunId: string | null = null;
    try {
      const [config] = await db
        .select()
        .from(userModelConfig)
        .where(eq(userModelConfig.userId, user.id))
        .limit(1);

      if (config) {
        const keyProviders: Set<string> = new Set(aiKeys.map((k) => k.provider));
        const slots: { name: 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d'; config: SlotConfig }[] = [];

        if (config.slotA) slots.push({ name: 'slot_a', config: config.slotA as SlotConfig });
        if (config.slotB) slots.push({ name: 'slot_b', config: config.slotB as SlotConfig });
        if (config.slotC) slots.push({ name: 'slot_c', config: config.slotC as SlotConfig });
        if (config.slotD) slots.push({ name: 'slot_d', config: config.slotD as SlotConfig });

        const validSlots = slots.filter((s) => keyProviders.has(s.config.provider));

        if (validSlots.length > 0) {
          // Trigger fallback grounding if needed
          const needsFallback = validSlots.some(
            (s) => !AdapterFactory.hasWebSearch(s.config.provider as AIProvider),
          );
          if (needsFallback) {
            await fallbackGroundingQueue.add('launch-grounding', {
              niches: [nicheProfile.niche],
            });
          }

          const runId = uuidv4();
          discoveryRunId = runId;

          const childrenJobs: FlowJob[] = validSlots.map((slot) => ({
            name: `discovery-${user.id}-${slot.name}`,
            queueName: QUEUE_NAMES.DISCOVERY_LLM,
            data: {
              userId: user.id,
              slotName: slot.name,
              provider: slot.config.provider,
              model: slot.config.model,
              discoveryRunId: runId,
            } satisfies DiscoveryLLMJobData,
            opts: {
              attempts: 2,
              backoff: { type: 'exponential' as const, delay: 30000 },
              removeOnComplete: { count: 100 },
              removeOnFail: { count: 50 },
            },
          }));

          await flowProducer.add({
            name: `merge-${user.id}-${runId}`,
            queueName: QUEUE_NAMES.DISCOVERY_MERGE,
            data: {
              userId: user.id,
              discoveryRunId: runId,
            } satisfies DiscoveryMergeJobData,
            children: childrenJobs,
            opts: {
              attempts: 1,
              removeOnComplete: { count: 100 },
            },
          });
        }
      }
    } catch (discoveryErr) {
      // Don't fail the launch if discovery queueing fails — it can be triggered manually
      console.error('Failed to queue initial discovery run:', discoveryErr);
    }

    return NextResponse.json({ success: true, redirect: '/dashboard', discoveryRunId });
  } catch (err) {
    console.error('Launch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
