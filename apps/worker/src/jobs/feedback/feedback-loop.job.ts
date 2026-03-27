import { Worker, Job } from 'bullmq'
import { db, scoredTopics, scoringWeights, scoringFeedback, topicPerformance } from '@techjm/db'
import { eq, and, sql } from 'drizzle-orm'
import { connection } from '../../redis.js'
import { QUEUE_NAMES, type FeedbackLoopJobData } from '../../queues.js'
import { updateScoringWeights } from './weight-adjuster.js'
import { learnCaptionPatterns } from './caption-learner.js'
import { computeOptimalTimes } from './time-optimizer.js'
import { withErrorHandling } from '../../lib/error-handler.js'

const MIN_POSTS_FOR_LEARNING = 10

async function processFeedbackLoop(job: Job<FeedbackLoopJobData>) {
  const { userId, postId, platform, scoredTopicId } = job.data

  job.log(`Feedback loop: user=${userId}, post=${postId}, platform=${platform}`)

  // 1. Load this post's predicted vs actual engagement
  const scored = await db.query.scoredTopics.findFirst({
    where: eq(scoredTopics.id, scoredTopicId),
  })
  if (!scored) {
    job.log('Scored topic not found — skipping feedback')
    return { skipped: true, reason: 'scored_topic_not_found' }
  }

  const finalEngagement = await db.query.topicPerformance.findFirst({
    where: and(eq(topicPerformance.postId, postId), eq(topicPerformance.checkpoint, '48h')),
  })
  if (!finalEngagement) {
    job.log('No 48h engagement data — skipping feedback')
    return { skipped: true, reason: 'no_48h_data' }
  }

  // 2. Compute score delta
  const predictedScore = parseFloat(scored.finalScore || '0')
  const actualEngagement = parseFloat(finalEngagement.engagementScore || '0')

  // Normalize actual engagement to same scale as predicted score
  const allPerformance = await db.query.topicPerformance.findMany({
    where: eq(topicPerformance.checkpoint, '48h'),
    columns: { engagementScore: true },
    limit: 100,
  })

  const scores = allPerformance
    .map((p) => parseFloat(p.engagementScore || '0'))
    .filter((s) => s > 0)
  const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1

  // Normalize actual to a 0-15 scale centered on mean
  const normalizedActual = mean > 0 ? (actualEngagement / mean) * 5 + 2.5 : 5
  const normalizedActualCapped = Math.max(0, Math.min(15, normalizedActual))

  const scoreDelta = normalizedActualCapped - predictedScore

  job.log(
    `Predicted: ${predictedScore.toFixed(3)}, Actual (normalized): ${normalizedActualCapped.toFixed(3)}, Delta: ${scoreDelta.toFixed(3)}`,
  )

  // 3. Store feedback record with weights snapshot
  const currentWeights = await db.query.scoringWeights.findMany({
    where: eq(scoringWeights.userId, userId),
  })
  const weightsSnapshot = Object.fromEntries(
    currentWeights.map((w) => [w.dimension, parseFloat(w.weight)]),
  )

  await db.insert(scoringFeedback).values({
    postId,
    topicId: scoredTopicId,
    userId,
    predictedScore: predictedScore.toFixed(3),
    actualEngagement: actualEngagement.toFixed(3),
    scoreDelta: scoreDelta.toFixed(3),
    weightsSnapshot,
    createdAt: new Date(),
  })

  // 4. Count posts with 48h data for this user
  const feedbackCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(scoringFeedback)
    .where(eq(scoringFeedback.userId, userId))

  const totalFeedbackPosts = feedbackCount[0]?.count || 0

  job.log(`Total feedback posts for this user: ${totalFeedbackPosts}`)

  if (totalFeedbackPosts < MIN_POSTS_FOR_LEARNING) {
    job.log(
      `Need ${MIN_POSTS_FOR_LEARNING} posts for learning. Have ${totalFeedbackPosts}. Collecting baseline only.`,
    )
    return {
      feedbackRecorded: true,
      weightsAdjusted: false,
      reason: `cold_start: ${totalFeedbackPosts}/${MIN_POSTS_FOR_LEARNING} posts`,
    }
  }

  // 5. Run the three learning modules
  const weightResult = await updateScoringWeights(userId, job)
  const captionResult = await learnCaptionPatterns(userId, job)
  const timeResult = await computeOptimalTimes(userId, job)

  job.log(
    `Feedback complete: weights=${weightResult.adjusted ? 'updated' : 'unchanged'}, caption=${captionResult.patternsFound}, times=${timeResult.bestSlots}`,
  )

  return {
    feedbackRecorded: true,
    weightsAdjusted: weightResult.adjusted,
    weightChanges: weightResult.changes,
    captionPatternsLearned: captionResult.patternsFound,
    optimalTimesComputed: timeResult.bestSlots,
    totalFeedbackPosts,
  }
}

export const feedbackLoopWorker = new Worker<FeedbackLoopJobData>(
  QUEUE_NAMES.FEEDBACK_LOOP,
  withErrorHandling('feedback-loop', processFeedbackLoop),
  { connection, concurrency: 2 },
)

feedbackLoopWorker.on('failed', (job, err) => {
  console.error(`Feedback loop failed: post=${job?.data?.postId}`, err.message)
})
