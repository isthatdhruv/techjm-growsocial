import type { Redis } from 'ioredis';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number | null;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Discovery
  'discovery:trigger': { maxRequests: 10, windowSeconds: 86400 },

  // Content generation
  'caption:generate': { maxRequests: 30, windowSeconds: 86400 },
  'image:generate': { maxRequests: 20, windowSeconds: 86400 },

  // Sub-agent calls (7 per topic, ~15 topics = 105 calls)
  'subagent:call': { maxRequests: 300, windowSeconds: 86400 },

  // Publishing
  'publish:post': { maxRequests: 20, windowSeconds: 86400 },

  // API general
  'api:general': { maxRequests: 200, windowSeconds: 3600 },

  // AI key validation (prevent brute force)
  'validate:key': { maxRequests: 20, windowSeconds: 3600 },
};

export class RateLimiter {
  constructor(private redis: Redis) {}

  async check(userId: string, action: string): Promise<RateLimitResult> {
    const config = RATE_LIMITS[action];
    if (!config) {
      return { allowed: true, remaining: 999, resetAt: new Date(), retryAfterSeconds: null };
    }

    const key = `ratelimit:${action}:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;

    // Sliding window via sorted set
    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipeline.expire(key, config.windowSeconds);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) || 0;

    if (currentCount >= config.maxRequests) {
      // Over limit - remove the speculative add
      const members = await this.redis.zrange(key, -1, -1);
      if (members.length > 0) {
        await this.redis.zrem(key, members[0]);
      }

      const oldestEntries = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldestEntries.length >= 2 ? parseInt(oldestEntries[1]) : now;
      const resetAt = new Date((oldestTimestamp + config.windowSeconds) * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));

      return { allowed: false, remaining: 0, resetAt, retryAfterSeconds };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - currentCount - 1,
      resetAt: new Date((now + config.windowSeconds) * 1000),
      retryAfterSeconds: null,
    };
  }

  async enforce(userId: string, action: string): Promise<RateLimitResult> {
    return this.check(userId, action);
  }

  async getUsage(userId: string): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
    const usage: Record<string, { used: number; limit: number; remaining: number }> = {};

    for (const [action, config] of Object.entries(RATE_LIMITS)) {
      const key = `ratelimit:${action}:${userId}`;
      const windowStart = Math.floor(Date.now() / 1000) - config.windowSeconds;

      await this.redis.zremrangebyscore(key, 0, windowStart);
      const count = await this.redis.zcard(key);

      usage[action] = {
        used: count,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
      };
    }

    return usage;
  }
}

let limiterInstance: RateLimiter | null = null;

export function getRateLimiter(redis: Redis): RateLimiter {
  if (!limiterInstance) {
    limiterInstance = new RateLimiter(redis);
  }
  return limiterInstance;
}
