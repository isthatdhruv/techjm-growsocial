import { NextResponse } from 'next/server';
import { getRateLimiter } from '@techjm/rate-limiter';
import { redis } from './redis';

const limiter = getRateLimiter(redis);

export async function withRateLimit(
  userId: string,
  action: string,
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[rate-limit] bypassed in ${process.env.NODE_ENV || 'unknown'} for action=${action} user=${userId}`);
    return null;
  }

  const result = await limiter.enforce(userId, action);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        action,
        retryAfterSeconds: result.retryAfterSeconds,
        resetAt: result.resetAt.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfterSeconds || 60),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.toISOString(),
        },
      },
    );
  }

  return null;
}
