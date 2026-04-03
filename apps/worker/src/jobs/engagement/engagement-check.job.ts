import { Worker, Job } from 'bullmq'
import { db, posts, topicPerformance, platformConnections, decrypt } from '@techjm/db'
import { eq, and } from 'drizzle-orm'
import { connection } from '../../redis.js'
import { QUEUE_NAMES, type EngagementCheckJobData, type FeedbackLoopJobData, feedbackLoopQueue } from '../../queues.js'
import { fetchLinkedInMetrics } from './linkedin-metrics.js'
import { fetchXMetrics } from './x-metrics.js'
import { withErrorHandling } from '../../lib/error-handler.js'

interface PlatformMetrics {
  impressions: number
  likes: number
  comments: number
  shares: number
}

async function processEngagementCheck(job: Job<EngagementCheckJobData>) {
  const { userId, postId, platform, externalId, checkpoint, accessTokenEnc, orgUrn } = job.data

  job.log(`Engagement check: post=${postId}, platform=${platform}, checkpoint=${checkpoint}`)

  // 1. Verify post still exists and is published
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
  })
  if (!post || post.status !== 'published') {
    job.log(`Post ${postId} not found or not published — skipping`)
    return { skipped: true, reason: 'post_not_published' }
  }

  // 2. Decrypt access token (re-read from DB on failure — token may have been rotated)
  let accessToken: string
  try {
    accessToken = decrypt(accessTokenEnc)
  } catch {
    job.log('Decryption failed — re-reading token from DB')
    const conn = await db.query.platformConnections.findFirst({
      where: and(
        eq(platformConnections.userId, userId),
        eq(platformConnections.platform, platform),
      ),
      columns: {
        accessTokenEnc: true,
      },
    })
    if (!conn) throw new Error(`No ${platform} connection for user ${userId}`)
    accessToken = decrypt(conn.accessTokenEnc)
  }

  // 3. Fetch metrics from platform API
  let metrics: PlatformMetrics

  try {
    if (platform === 'linkedin') {
      metrics = await fetchLinkedInMetrics(externalId, accessToken, orgUrn)
    } else {
      metrics = await fetchXMetrics(externalId, accessToken)
    }
  } catch (apiError: unknown) {
    const err = apiError as { status?: number; message?: string }
    if (err.status === 401) {
      job.log(`Token expired for ${platform} — user needs to re-auth`)
      throw new Error(`TOKEN_EXPIRED: ${platform} access token expired`)
    }
    if (err.status === 429) {
      throw new Error(`RATE_LIMITED: ${platform} rate limit hit`)
    }
    throw apiError
  }

  job.log(
    `Metrics: impressions=${metrics.impressions}, likes=${metrics.likes}, comments=${metrics.comments}, shares=${metrics.shares}`,
  )

  // 4. Compute engagement score
  // Formula: likes(0.2) + comments(0.4) + shares(0.3) + normalizedImpressions(0.1)
  const normalizedImpressions = metrics.impressions / 100
  const engagementScore =
    metrics.likes * 0.2 +
    metrics.comments * 0.4 +
    metrics.shares * 0.3 +
    normalizedImpressions * 0.1

  job.log(`Engagement score: ${engagementScore.toFixed(4)}`)

  // 5. Upsert into topic_performance
  const existing = await db.query.topicPerformance.findFirst({
    where: and(
      eq(topicPerformance.postId, postId),
      eq(topicPerformance.checkpoint, checkpoint),
    ),
  })

  if (existing) {
    await db
      .update(topicPerformance)
      .set({
        impressions: metrics.impressions,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        engagementScore: engagementScore.toFixed(4),
        measuredAt: new Date(),
      })
      .where(eq(topicPerformance.id, existing.id))
    job.log(`Updated existing ${checkpoint} checkpoint`)
  } else {
    await db.insert(topicPerformance).values({
      postId,
      platform,
      impressions: metrics.impressions,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      engagementScore: engagementScore.toFixed(4),
      checkpoint,
      measuredAt: new Date(),
    })
    job.log(`Inserted new ${checkpoint} checkpoint`)
  }

  // 6. Final checkpoint — trigger feedback loop (Phase 10)
  if (checkpoint === '48h') {
    job.log('Final checkpoint (48h) — triggering feedback loop')

    const postData = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      columns: { topicId: true },
    })

    if (postData?.topicId) {
      await feedbackLoopQueue.add(
        `feedback-${postId}`,
        {
          userId,
          postId,
          platform,
          scoredTopicId: postData.topicId,
        } as FeedbackLoopJobData,
        {
          delay: 0,
          attempts: 2,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: { count: 500 },
        },
      )
      job.log(`Queued feedback-loop job for post ${postId}, topic ${postData.topicId}`)
    }
  }

  return {
    postId,
    platform,
    checkpoint,
    metrics,
    engagementScore: parseFloat(engagementScore.toFixed(4)),
  }
}

export const engagementCheckWorker = new Worker<EngagementCheckJobData>(
  QUEUE_NAMES.ENGAGEMENT_CHECK,
  withErrorHandling('engagement-check', processEngagementCheck),
  {
    connection,
    concurrency: 6,
    limiter: {
      max: 15,
      duration: 60000,
    },
  },
)

engagementCheckWorker.on('failed', (job, err) => {
  console.error(
    `Engagement check failed: ${job?.data?.checkpoint} for post ${job?.data?.postId}`,
    err.message,
  )
})
