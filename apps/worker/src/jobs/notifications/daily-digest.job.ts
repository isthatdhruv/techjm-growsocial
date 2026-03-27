import { Worker, Job, Queue } from 'bullmq'
import { db, notificationPreferences, scoredTopics, rawTopics } from '@techjm/db'
import { eq, and, desc } from 'drizzle-orm'
import { sendDailyDigest } from '../../notifications/telegram.js'
import { connection } from '../../redis.js'
import { withErrorHandling } from '../../lib/error-handler.js'

async function processDailyDigest(job: Job) {
  const prefs = await db.query.notificationPreferences.findMany({
    where: and(
      eq(notificationPreferences.telegramEnabled, true),
      eq(notificationPreferences.notifyDailyDigest, true),
    ),
  })

  job.log(`Daily digest: ${prefs.length} users to notify`)

  let sentCount = 0

  for (const pref of prefs) {
    if (!pref.telegramChatId) continue

    const topics = await db
      .select({
        title: rawTopics.title,
        score: scoredTopics.finalScore,
        tier: rawTopics.consensusTier,
        id: scoredTopics.id,
      })
      .from(scoredTopics)
      .innerJoin(rawTopics, eq(rawTopics.id, scoredTopics.rawTopicId))
      .where(and(eq(scoredTopics.userId, pref.userId), eq(scoredTopics.status, 'pending')))
      .orderBy(desc(scoredTopics.finalScore))
      .limit(10)

    if (topics.length === 0) {
      job.log(`User ${pref.userId}: no pending topics, skipping`)
      continue
    }

    await sendDailyDigest(
      pref.telegramChatId,
      topics.map((t) => ({
        title: t.title,
        score: parseFloat(t.score || '0'),
        tier: t.tier || 'experimental',
        id: t.id,
      })),
    )

    sentCount++
  }

  job.log(`Daily digest sent to ${sentCount} users`)
  return { sent: sentCount, total: prefs.length }
}

export const dailyDigestWorker = new Worker('daily-digest', withErrorHandling('daily-digest', processDailyDigest), {
  connection,
  concurrency: 1,
})

export async function scheduleDailyDigest() {
  const queue = new Queue('daily-digest', { connection })
  await queue.upsertJobScheduler(
    'daily-digest-8am',
    { pattern: '0 8 * * *' },
    { name: 'daily-digest' },
  )
}
