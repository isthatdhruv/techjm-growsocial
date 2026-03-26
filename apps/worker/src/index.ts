import { Worker } from 'bullmq';
import { connection, healthCheckQueue } from './queues.js';

const healthCheckWorker = new Worker(
  'health-check',
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

async function start() {
  // Schedule repeatable health-check job every 5 minutes
  await healthCheckQueue.upsertJobScheduler(
    'health-check-scheduler',
    { every: 5 * 60 * 1000 },
    { data: { type: 'health-check' } },
  );

  console.log('Worker started');
}

start().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
