import { Worker, Job } from 'bullmq';
import { db, posts, platformConnections, decrypt } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { connection } from '../../redis.js';
import { publishQueue, engagementCheckQueue, QUEUE_NAMES, type PublishJobData, type EngagementCheckJobData } from '../../queues.js';
import { publishViaPostiz } from './postiz-client.js';
import { publishDirect } from './direct-publisher.js';
import { logPublishAttempt } from './log.js';
import { notifyPublishResult } from '../../notifications/publish-notify.js';
import { withErrorHandling } from '../../lib/error-handler.js';

// Retry delays: 1 min, 5 min, 15 min
const RETRY_DELAYS = [60_000, 300_000, 900_000];
const MAX_RETRIES = 3;

async function processPublish(job: Job<PublishJobData>) {
  const { userId, postId, platform, retryCount } = job.data;

  job.log(
    `Publishing: post=${postId}, platform=${platform}, attempt=${retryCount + 1}/${MAX_RETRIES + 1}`,
  );

  // 1. Load post data
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  });
  if (!post) throw new Error(`Post ${postId} not found`);
  if (post.status === 'published') {
    job.log('Post already published — skipping');
    return { alreadyPublished: true };
  }

  // 2. Load platform connection
  const conn = await db.query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.userId, userId),
      eq(platformConnections.platform, platform),
    ),
  });
  if (!conn) {
    await logPublishAttempt(postId, platform, false, null, 'No platform connection found');
    throw new Error(`No ${platform} connection for user ${userId}`);
  }

  const accessToken = decrypt(conn.accessTokenEnc);

  // 3. Update status to publishing
  await db
    .update(posts)
    .set({ status: 'publishing', updatedAt: new Date() })
    .where(eq(posts.id, postId));

  // 4. Attempt publishing
  let externalId: string | null = null;
  let publishError: string | null = null;

  try {
    // Try Postiz first
    const postizResult = await publishViaPostiz(
      { caption: post.caption, imageUrl: post.imageUrl, hashtags: post.hashtags },
      platform,
      accessToken,
      conn.orgUrn,
    );
    externalId = postizResult.externalId;
    job.log(`Published via Postiz: externalId=${externalId}`);
  } catch (postizError: unknown) {
    const postizMsg = postizError instanceof Error ? postizError.message : 'Unknown Postiz error';
    job.log(`Postiz failed: ${postizMsg}. Trying direct API...`);

    try {
      // Fallback: direct API publishing
      const directResult = await publishDirect(
        { caption: post.caption, imageUrl: post.imageUrl, hashtags: post.hashtags },
        platform,
        accessToken,
        conn.orgUrn,
      );
      externalId = directResult.externalId;
      job.log(`Published via direct API: externalId=${externalId}`);
    } catch (directError: unknown) {
      const directMsg =
        directError instanceof Error ? directError.message : 'Unknown direct error';
      publishError = `Postiz: ${postizMsg}. Direct: ${directMsg}`;
      job.log(`Both publishing methods failed: ${publishError}`);
    }
  }

  // 5. Log the attempt
  await logPublishAttempt(postId, platform, !publishError, externalId, publishError, retryCount);

  // 6. Handle success or failure
  if (!publishError && externalId) {
    await db
      .update(posts)
      .set({
        status: 'published',
        publishedAt: new Date(),
        externalId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    job.log(`Published successfully: ${platform} post ${externalId}`);

    // ═══ Phase 9: Queue 4 engagement check jobs ═══
    const CHECKPOINTS = [
      { checkpoint: '2h' as const, delay: 2 * 60 * 60 * 1000 },
      { checkpoint: '6h' as const, delay: 6 * 60 * 60 * 1000 },
      { checkpoint: '24h' as const, delay: 24 * 60 * 60 * 1000 },
      { checkpoint: '48h' as const, delay: 48 * 60 * 60 * 1000 },
    ]

    for (const { checkpoint, delay } of CHECKPOINTS) {
      await engagementCheckQueue.add(
        `engagement-${postId}-${checkpoint}`,
        {
          userId,
          postId,
          platform,
          externalId: externalId!,
          checkpoint,
          accessTokenEnc: conn.accessTokenEnc,
          orgUrn: conn.orgUrn || null,
        } satisfies EngagementCheckJobData,
        {
          delay,
          jobId: `engagement-${postId}-${checkpoint}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        }
      )
    }

    job.log(`Queued 4 engagement checks: 2h, 6h, 24h, 48h for post ${postId}`)

    // Phase 11: Telegram notification
    await notifyPublishResult(userId, true, {
      platform,
      caption: post.caption || '',
      externalUrl: `https://${platform === 'linkedin' ? 'linkedin.com/feed/update/' : 'x.com/i/web/status/'}${externalId}`,
    })

    return { success: true, externalId, platform };
  } else {
    // Retry or give up
    if (retryCount < MAX_RETRIES) {
      const nextDelay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      job.log(`Retry ${retryCount + 1}/${MAX_RETRIES} in ${nextDelay / 1000}s`);

      await publishQueue.add(
        `publish-retry-${postId}-${retryCount + 1}`,
        {
          ...job.data,
          retryCount: retryCount + 1,
        },
        { delay: nextDelay },
      );

      return { success: false, willRetry: true, nextRetryIn: `${nextDelay / 1000}s` };
    } else {
      // All retries exhausted
      await db
        .update(posts)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(posts.id, postId));

      job.log(`All retries exhausted. Post marked as failed.`);

      // Phase 11: Telegram failure notification
      await notifyPublishResult(userId, false, {
        platform,
        caption: post.caption || '',
        error: publishError || 'All retries exhausted',
        retryCount,
      })

      return { success: false, willRetry: false, error: publishError };
    }
  }
}

export const publishWorker = new Worker(QUEUE_NAMES.PUBLISH, withErrorHandling('publish', processPublish), {
  connection,
  concurrency: 4,
  limiter: {
    max: 10,
    duration: 60_000,
  },
});

publishWorker.on('failed', (job, err) => {
  console.error(`Publish job hard failure: ${job?.id}`, err.message);
});
