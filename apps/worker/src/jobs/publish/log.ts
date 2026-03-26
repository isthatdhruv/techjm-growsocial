import { db, publishLog } from '@techjm/db';

export async function logPublishAttempt(
  postId: string,
  platform: string,
  success: boolean,
  externalId: string | null,
  errorMessage: string | null,
  retryCount: number = 0,
) {
  await db.insert(publishLog).values({
    postId,
    platform: platform as 'linkedin' | 'x',
    attemptedAt: new Date(),
    success,
    externalId,
    errorMessage,
    retryCount,
  });
}
