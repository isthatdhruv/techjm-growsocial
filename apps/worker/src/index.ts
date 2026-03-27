import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Worker, Queue } from 'bullmq';
import { connection, redis } from './redis.js';
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
import { feedbackLoopWorker } from './jobs/feedback/feedback-loop.job.js';
import { dailyDigestWorker, scheduleDailyDigest } from './jobs/notifications/daily-digest.job.js';
import { weeklyReportWorker, scheduleWeeklyReport } from './jobs/notifications/weekly-report.job.js';
import {
  connectionHealthWorker,
  scheduleConnectionHealth,
} from './jobs/health/connection-health.job.js';
import { tokenRefreshWorker, scheduleTokenRefresh } from './jobs/health/token-refresh.job.js';
import { backupWorker, scheduleBackups } from './jobs/backup/pg-dump.job.js';
import { startBullBoard } from './admin/bull-board.js';

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
  feedbackLoopWorker,
  dailyDigestWorker,
  weeklyReportWorker,
  connectionHealthWorker,
  tokenRefreshWorker,
  backupWorker,
];

// Enhanced health check HTTP server
async function handleHealthRequest(_req: IncomingMessage, res: ServerResponse) {
  const url = new URL(_req.url || '/', `http://localhost:${WORKER_PORT}`);

  if (url.pathname === '/metrics') {
    return handleMetrics(res);
  }

  const uptime = Math.round((Date.now() - startTime) / 1000);

  const health: Record<string, unknown> = {
    status: 'ok',
    uptime,
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    services: {},
    queues: {},
    warnings: [] as string[],
  };

  // Check Redis
  try {
    await redis.ping();
    (health.services as Record<string, string>).redis = 'connected';
  } catch {
    (health.services as Record<string, string>).redis = 'disconnected';
    health.status = 'degraded';
  }

  // Check PostgreSQL
  try {
    const { db } = await import('@techjm/db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1`);
    (health.services as Record<string, string>).postgres = 'connected';
  } catch {
    (health.services as Record<string, string>).postgres = 'disconnected';
    health.status = 'degraded';
  }

  // Check queue depths
  const queueEntries = Object.entries(QUEUE_NAMES);
  for (const [key, name] of queueEntries) {
    try {
      const q = new Queue(name, { connection });
      const counts = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
      (health.queues as Record<string, unknown>)[key] = counts;
      await q.close();
    } catch {
      (health.queues as Record<string, unknown>)[key] = 'unavailable';
    }
  }

  // Check for concerning signs
  let totalFailed = 0;
  for (const val of Object.values(health.queues as Record<string, unknown>)) {
    if (val && typeof val === 'object' && 'failed' in val) {
      totalFailed += (val as { failed: number }).failed || 0;
    }
  }

  if (totalFailed > 50) {
    health.status = 'degraded';
    (health.warnings as string[]).push(`${totalFailed} failed jobs across all queues`);
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health));
}

async function handleMetrics(res: ServerResponse) {
  let metrics = '';
  const queueEntries = Object.entries(QUEUE_NAMES);

  for (const [, name] of queueEntries) {
    try {
      const q = new Queue(name, { connection });
      const counts = await q.getJobCounts('active', 'waiting', 'failed', 'delayed');
      metrics += `bullmq_queue_waiting{queue="${name}"} ${counts.waiting}\n`;
      metrics += `bullmq_queue_active{queue="${name}"} ${counts.active}\n`;
      metrics += `bullmq_queue_failed{queue="${name}"} ${counts.failed}\n`;
      metrics += `bullmq_queue_delayed{queue="${name}"} ${counts.delayed}\n`;
      await q.close();
    } catch {
      // skip
    }
  }

  metrics += `process_uptime_seconds ${process.uptime()}\n`;
  metrics += `process_memory_rss_bytes ${process.memoryUsage().rss}\n`;

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(metrics);
}

const healthServer = createServer(handleHealthRequest);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  healthServer.close();
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

  // Phase 11: Notification & health crons
  await scheduleDailyDigest();
  await scheduleWeeklyReport();
  await scheduleConnectionHealth();
  await scheduleTokenRefresh();

  // Phase 12: Backup crons + Bull Board
  await scheduleBackups();
  startBullBoard(3101);

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
  console.log('  - feedback-loop (concurrency: 2, triggers after 48h checkpoint)');
  console.log('  - daily-digest (cron: 8 AM UTC)');
  console.log('  - weekly-report (cron: Monday 9 AM UTC)');
  console.log('  - connection-health (cron: 5:30 AM daily)');
  console.log('  - token-refresh (cron: Sunday 3 AM weekly)');
  console.log('  - backup (cron: every 6h daily + weekly Sunday 2 AM)');
  console.log('  - Bull Board: http://localhost:3101/admin/queues');
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
