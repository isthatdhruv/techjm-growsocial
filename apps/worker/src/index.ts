import { createServer } from 'node:http';
import { Worker } from 'bullmq';
import { connection } from './redis.js';
import { healthCheckQueue, QUEUE_NAMES } from './queues.js';
import {
  fallbackGroundingWorker,
  scheduleFallbackGrounding,
} from './jobs/fallback/grounding.job.js';
import { discoveryCronWorker, scheduleDiscoveryCron } from './jobs/discovery/cron.job.js';
import { discoveryLLMWorker } from './jobs/discovery/llm.job.js';
import { discoveryMergeWorker } from './jobs/discovery/merge.job.js';
import { subAgentWorker } from './jobs/sub-agents/sub-agent.job.js';
import { scoringOrchestratorWorker } from './jobs/sub-agents/orchestrator.job.js';
import { captionGenWorker } from './jobs/content/caption-gen.job.js';
import { imagePromptGenWorker } from './jobs/content/image-prompt-gen.job.js';
import { imageGenWorker } from './jobs/content/image-gen.job.js';
import { publishWorker } from './jobs/publish/publish.job.js';
import { engagementCheckWorker } from './jobs/engagement/engagement-check.job.js';

const WORKER_PORT = parseInt(process.env.WORKER_PORT || '3100');
const startTime = Date.now();

// Health-check worker (existing from Phase 1)
const healthCheckWorker = new Worker(
  QUEUE_NAMES.HEALTH_CHECK,
  async (job) => {
    console.log(`[health-check] Worker healthy — ${new Date().toISOString()}`, job.data);
  },
  { connection },
);

healthCheckWorker.on('completed', (job) => {
  console.log(`[health-check] Job ${job.id} completed`);
});

healthCheckWorker.on('failed', (job, err) => {
  console.error(`[health-check] Job ${job?.id} failed:`, err.message);
});

// All workers for graceful shutdown
const allWorkers = [
  healthCheckWorker,
  fallbackGroundingWorker,
  discoveryCronWorker,
  discoveryLLMWorker,
  discoveryMergeWorker,
  subAgentWorker,
  scoringOrchestratorWorker,
  captionGenWorker,
  imagePromptGenWorker,
  imageGenWorker,
  publishWorker,
  engagementCheckWorker,
];

// Health check HTTP server
const healthServer = createServer(async (_req, res) => {
  const uptime = Math.round((Date.now() - startTime) / 1000);

  const queueCounts: Record<string, unknown> = {};
  for (const [key, name] of Object.entries(QUEUE_NAMES)) {
    try {
      const { Queue } = await import('bullmq');
      const q = new Queue(name, { connection });
      const counts = await q.getJobCounts('active', 'waiting', 'completed', 'failed');
      queueCounts[key] = counts;
      await q.close();
    } catch {
      queueCounts[key] = 'unavailable';
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'ok',
      uptime,
      queues: queueCounts,
    }),
  );
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  // Close health server
  healthServer.close();

  // Close all workers
  await Promise.allSettled(allWorkers.map((w) => w.close()));

  console.log('All workers closed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function main() {
  // Schedule repeatable health-check
  await healthCheckQueue.upsertJobScheduler(
    'health-check-scheduler',
    { every: 5 * 60 * 1000 },
    { data: { type: 'health-check' } },
  );

  // Schedule discovery crons
  await scheduleFallbackGrounding();
  await scheduleDiscoveryCron();

  // Start health server
  healthServer.listen(WORKER_PORT, () => {
    console.log(`Worker started. Health: http://localhost:${WORKER_PORT}/health`);
  });

  console.log('Workers registered:');
  console.log('  - health-check (every 5 minutes)');
  console.log('  - fallback-grounding (cron: 5:55 AM)');
  console.log('  - discovery-cron (cron: 6:00 AM)');
  console.log('  - discovery-llm (parallel, concurrency: 8)');
  console.log('  - discovery-merge (after LLM jobs complete)');
  console.log('  - sub-agent (parallel, concurrency: 14, rate: 40/min)');
  console.log('  - scoring-orchestrator (after 7 sub-agents complete)');
  console.log('  - caption-gen (concurrency: 4, triggered on topic approval)');
  console.log('  - image-prompt-gen (concurrency: 4, after caption-gen)');
  console.log('  - image-gen (concurrency: 2, after image-prompt-gen)');
  console.log('  - publish (concurrency: 4, rate: 10/min, delayed jobs)');
  console.log('  - engagement-check (concurrency: 6, rate: 15/min, checkpoints: 2h/6h/24h/48h)');
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
