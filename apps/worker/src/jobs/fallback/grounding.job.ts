import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { FallbackGroundingService } from '@techjm/ai-adapters';
import { db, fallbackGroundingCache, users, userNicheProfiles } from '@techjm/db';
import { eq, gt, lt } from 'drizzle-orm';
import { connection } from '../../redis.js';
import { QUEUE_NAMES } from '../../queues.js';
import type { FallbackGroundingJobData } from '../../queues.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function processFallbackGrounding(job: Job<FallbackGroundingJobData>) {
  // Dynamically get all active niches from DB (cron data.niches may be empty)
  let niches = job.data.niches;

  if (!niches || niches.length === 0) {
    const activeUsers = await db
      .select({ niche: userNicheProfiles.niche })
      .from(userNicheProfiles)
      .innerJoin(users, eq(users.id, userNicheProfiles.userId))
      .where(eq(users.onboardingStep, 'complete'));

    niches = [...new Set(activeUsers.map((u) => u.niche))];
  }

  if (niches.length === 0) {
    job.log('No active niches found — skipping grounding');
    return { nichesProcessed: 0, timestamp: new Date().toISOString() };
  }

  job.log(`Starting fallback grounding for niches: ${niches.join(', ')}`);

  const groundingService = new FallbackGroundingService();

  for (const niche of niches) {
    try {
      // Check if fresh cache exists (< 6 hours old)
      const freshCache = await db
        .select()
        .from(fallbackGroundingCache)
        .where(gt(fallbackGroundingCache.expiresAt, new Date()));

      if (freshCache.length >= 3) {
        job.log(`Fresh cache exists for niche "${niche}" (${freshCache.length} sources) — skipping`);
        continue;
      }

      // Collect fresh grounding data
      const items = await groundingService.collect(niche);
      job.log(`Collected ${items.length} grounding items for niche: ${niche}`);

      // Delete expired entries
      const now = new Date();
      await db.delete(fallbackGroundingCache).where(lt(fallbackGroundingCache.expiresAt, now));

      // Group items by source and insert
      const bySource = new Map<string, typeof items>();
      for (const item of items) {
        const existing = bySource.get(item.source) || [];
        existing.push(item);
        bySource.set(item.source, existing);
      }

      for (const [source, sourceItems] of bySource) {
        await db.insert(fallbackGroundingCache).values({
          source,
          data: sourceItems,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + SIX_HOURS_MS),
        });
      }

      await job.updateProgress(Math.round(((niches.indexOf(niche) + 1) / niches.length) * 100));
    } catch (error: any) {
      job.log(`ERROR scraping for niche ${niche}: ${error.message}`);
    }
  }

  return { nichesProcessed: niches.length, timestamp: new Date().toISOString() };
}

export const fallbackGroundingWorker = new Worker(
  QUEUE_NAMES.FALLBACK_GROUNDING,
  processFallbackGrounding,
  { connection, concurrency: 1 },
);

fallbackGroundingWorker.on('failed', (job, err) => {
  console.error(`[fallback-grounding] Job ${job?.id} failed:`, err.message);
});

export async function scheduleFallbackGrounding() {
  const queue = new Queue(QUEUE_NAMES.FALLBACK_GROUNDING, { connection });
  await queue.upsertJobScheduler(
    'daily-fallback-grounding',
    { pattern: '55 5 * * *' }, // 5:55 AM every day
    {
      name: 'fallback-grounding-daily',
      data: { niches: [] } as FallbackGroundingJobData,
    },
  );
}
