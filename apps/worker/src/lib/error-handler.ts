import { Job } from 'bullmq';
import { db } from '@techjm/db';
import { jobErrors } from '@techjm/db/schema';

export enum ErrorCategory {
  INVALID_KEY = 'INVALID_KEY',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

interface StructuredError {
  category: ErrorCategory;
  message: string;
  userId?: string;
  jobType: string;
  jobId: string;
  context?: Record<string, unknown>;
  stack?: string;
  timestamp: string;
}

async function logJobError(error: StructuredError): Promise<void> {
  try {
    await db.insert(jobErrors).values({
      userId: error.userId || null,
      jobType: error.jobType,
      jobId: error.jobId,
      errorCategory: error.category,
      errorMessage: error.message,
      context: error.context || null,
      stack: error.stack || null,
      createdAt: new Date(),
    });
  } catch (logError) {
    console.error('CRITICAL: Failed to log job error:', logError);
    console.error('Original error:', JSON.stringify(error));
  }
}

export function categorizeError(error: unknown): ErrorCategory {
  const err = error as { message?: string; status?: number; statusCode?: number };
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode;

  if (status === 401 || (msg.includes('invalid') && msg.includes('key')) || msg.includes('unauthorized')) {
    return ErrorCategory.INVALID_KEY;
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
    return ErrorCategory.RATE_LIMITED;
  }
  if (msg.includes('token') && (msg.includes('expired') || msg.includes('revoked'))) {
    return ErrorCategory.TOKEN_EXPIRED;
  }
  if (msg.includes('not found') || msg.includes('no rows')) {
    return ErrorCategory.DATA_NOT_FOUND;
  }
  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('fetch failed')) {
    return ErrorCategory.NETWORK_ERROR;
  }
  if ((status && status >= 500) || msg.includes('internal server error')) {
    return ErrorCategory.PROVIDER_ERROR;
  }

  return ErrorCategory.INTERNAL_ERROR;
}

export function withErrorHandling<T>(
  jobType: string,
  processor: (job: Job<T>) => Promise<unknown>,
) {
  return async (job: Job<T>) => {
    try {
      return await processor(job);
    } catch (error: unknown) {
      const err = error as { message?: string; stack?: string };
      const category = categorizeError(error);
      const userId = (job.data as Record<string, unknown>)?.userId as string | undefined;

      const structured: StructuredError = {
        category,
        message: err.message || 'Unknown error',
        userId,
        jobType,
        jobId: job.id || 'unknown',
        context: {
          jobData: job.data as Record<string, unknown>,
          attemptsMade: job.attemptsMade,
          timestamp: new Date().toISOString(),
        },
        stack: err.stack,
        timestamp: new Date().toISOString(),
      };

      await logJobError(structured);

      console.error(
        JSON.stringify({
          level: 'error',
          category: structured.category,
          message: structured.message,
          userId: structured.userId,
          jobType: structured.jobType,
          jobId: structured.jobId,
          attemptsMade: job.attemptsMade,
          timestamp: structured.timestamp,
        }),
      );

      throw error;
    }
  };
}
