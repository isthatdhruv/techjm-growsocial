import { Worker, Queue } from 'bullmq';
import type { Job, FlowJob } from 'bullmq';
import { db, users, getAvailableAiProviders, selectTextModel } from '@techjm/db';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { flowProducer, QUEUE_NAMES } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
import type { DiscoveryLLMJobData, DiscoveryMergeJobData } from '../../queues.js';
import { connection } from '../../redis.js';

interface SlotConfig {
  provider: string;
  model: string;
}

async function processDiscoveryCron(job: Job) {
  // Query all users with onboarding complete + their model config
  const activeUsers = await db.query.users.findMany({
    where: eq(users.onboardingStep, 'complete'),
    with: {
      modelConfig: true,
    },
  });

  job.log(`Discovery cron: found ${activeUsers.length} active users`);

  let usersQueued = 0;

  for (const user of activeUsers) {
    const config = user.modelConfig;
    // Build the slot configs from user's model_config
    const slots: { name: 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d'; config: SlotConfig }[] = [];

    if (config?.slotA) slots.push({ name: 'slot_a', config: config.slotA as SlotConfig });
    if (config?.slotB) slots.push({ name: 'slot_b', config: config.slotB as SlotConfig });
    if (config?.slotC) slots.push({ name: 'slot_c', config: config.slotC as SlotConfig });
    if (config?.slotD) slots.push({ name: 'slot_d', config: config.slotD as SlotConfig });

    const textProviders = (await getAvailableAiProviders(user.id)).filter(
      (provider) => provider.provider !== 'replicate',
    );

    if (slots.length === 0) {
      textProviders.slice(0, 4).forEach((provider, index) => {
        slots.push({
          name: (`slot_${String.fromCharCode(97 + index)}`) as 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d',
          config: {
            provider: provider.provider,
            model: selectTextModel(
              provider.provider,
              provider.models,
              provider.models[0] || 'gpt-4o-mini',
            ),
          },
        });
      });
    }

    if (slots.length === 0) {
      job.log(`User ${user.id}: no slots or fallback providers configured, skipping`);
      continue;
    }

    // Verify the user has an active key or env fallback for the configured providers
    const availableProviderSet = new Set(textProviders.map((provider) => provider.provider));
    let validSlots = slots.filter((s) => availableProviderSet.has(s.config.provider as any));
    if (validSlots.length === 0) {
      validSlots = textProviders.slice(0, 4).map((provider, index) => ({
        name: (`slot_${String.fromCharCode(97 + index)}`) as 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d',
        config: {
          provider: provider.provider,
          model: selectTextModel(
            provider.provider,
            provider.models,
            provider.models[0] || 'gpt-4o-mini',
          ),
        },
      }));
    }

    if (validSlots.length === 0) {
      job.log(`User ${user.id}: no slots have matching API keys, skipping`);
      continue;
    }

    const discoveryRunId = uuidv4();

    // BullMQ FlowProducer: 4 LLM children → 1 merge parent
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

    job.log(
      `User ${user.id}: queued ${validSlots.length} LLM jobs + 1 merge job (run: ${discoveryRunId})`,
    );
    usersQueued++;
  }

  return { usersProcessed: activeUsers.length, usersQueued };
}

export const discoveryCronWorker = new Worker(
  QUEUE_NAMES.DISCOVERY_CRON,
  withErrorHandling(QUEUE_NAMES.DISCOVERY_CRON, processDiscoveryCron),
  { connection, concurrency: 1 },
);

discoveryCronWorker.on('failed', (job, err) => {
  console.error(`[discovery-cron] Job ${job?.id} failed:`, err.message);
});

export async function scheduleDiscoveryCron() {
  const queue = new Queue(QUEUE_NAMES.DISCOVERY_CRON, { connection });
  await queue.upsertJobScheduler('daily-discovery', { pattern: '0 6 * * *' }, {
    name: 'discovery-cron-daily',
  });
}
