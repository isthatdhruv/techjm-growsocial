import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ connection config — plain object so BullMQ creates its own internal connections
export const connection = {
  host: new URL(redisUrl).hostname || 'localhost',
  port: parseInt(new URL(redisUrl).port || '6379'),
  maxRetriesPerRequest: null as null, // Required by BullMQ
};

// Separate IORedis instance for direct Redis operations (rate limiting, caching)
export const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
