import { Worker, Job, Queue } from 'bullmq'
import { db, notificationPreferences, posts, topicPerformance, scoringWeights } from '@techjm/db'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { sendWeeklyReport } from '../../notifications/telegram.js'
import { connection } from '../../redis.js'
import { withErrorHandling } from '../../lib/error-handler.js'

async function processWeeklyReport(job: Job) {
  const prefs = await db.query.notificationPreferences.findMany({
    where: and(
      eq(notificationPreferences.telegramEnabled, true),
      eq(notificationPreferences.notifyWeeklyReport, true),
    ),
  })

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let sentCount = 0

  for (const pref of prefs) {
    if (!pref.telegramChatId) continue

    const weekPosts = await db.query.posts.findMany({
      where: and(
        eq(posts.userId, pref.userId),
        eq(posts.status, 'published'),
        gte(posts.publishedAt, oneWeekAgo),
      ),
    })

    const engagementData = await db
      .select({
        totalEngagement: sql<number>`coalesce(sum(${topicPerformance.engagementScore}::numeric), 0)`,
        avgEngagement: sql<number>`coalesce(avg(${topicPerformance.engagementScore}::numeric), 0)`,
      })
      .from(topicPerformance)
      .innerJoin(posts, eq(topicPerformance.postId, posts.id))
      .where(
        and(
          eq(posts.userId, pref.userId),
          eq(topicPerformance.checkpoint, '48h'),
          gte(posts.publishedAt, oneWeekAgo),
        ),
      )

    const bestPost = await db
      .select({
        caption: posts.caption,
        score: topicPerformance.engagementScore,
      })
      .from(posts)
      .innerJoin(
        topicPerformance,
        and(eq(topicPerformance.postId, posts.id), eq(topicPerformance.checkpoint, '48h')),
      )
      .where(and(eq(posts.userId, pref.userId), gte(posts.publishedAt, oneWeekAgo)))
      .orderBy(desc(topicPerformance.engagementScore))
      .limit(1)

    const recentWeightUpdate = await db.query.scoringWeights.findFirst({
      where: and(eq(scoringWeights.userId, pref.userId), gte(scoringWeights.updatedAt, oneWeekAgo)),
    })

    await sendWeeklyReport(pref.telegramChatId, {
      postsPublished: weekPosts.length,
      totalEngagement: parseFloat(String(engagementData[0]?.totalEngagement || 0)),
      avgEngagement: parseFloat(String(engagementData[0]?.avgEngagement || 0)),
      bestPost:
        bestPost.length > 0
          ? {
              caption: bestPost[0].caption || '',
              score: parseFloat(bestPost[0].score || '0'),
            }
          : null,
      weightsUpdated: !!recentWeightUpdate,
    })

    sentCount++
  }

  job.log(`Weekly report sent to ${sentCount} users`)
  return { sent: sentCount }
}

export const weeklyReportWorker = new Worker('weekly-report', withErrorHandling('weekly-report', processWeeklyReport), {
  connection,
  concurrency: 1,
})

export async function scheduleWeeklyReport() {
  const queue = new Queue('weekly-report', { connection })
  await queue.upsertJobScheduler(
    'weekly-report-monday',
    { pattern: '0 9 * * 1' },
    { name: 'weekly-report' },
  )
}
