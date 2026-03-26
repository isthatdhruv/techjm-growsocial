import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const healthCheckQueue = new Queue('health-check', { connection });

// Future queues (Phase 3+):
// export const discoveryQueue = new Queue('discovery', { connection });
// export const scoringQueue = new Queue('scoring', { connection });
// export const publishQueue = new Queue('publish', { connection });
