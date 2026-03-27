import { Worker, Job, Queue } from 'bullmq'
import { db, platformConnections, notificationPreferences, decrypt } from '@techjm/db'
import { eq, and } from 'drizzle-orm'
import { sendTokenExpiryWarning, sendConnectionHealthAlert } from '../../notifications/telegram.js'
import { connection } from '../../redis.js'
import { withErrorHandling } from '../../lib/error-handler.js'

async function processConnectionHealth(job: Job) {
  const allConnections = await db.query.platformConnections.findMany()

  job.log(`Checking health of ${allConnections.length} connections`)

  let healthyCount = 0
  let degradedCount = 0
  let expiredCount = 0

  for (const conn of allConnections) {
    try {
      const accessToken = decrypt(conn.accessTokenEnc)

      let healthy = false

      if (conn.platform === 'linkedin') {
        const response = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        })
        healthy = response.ok
        if (!healthy) job.log(`LinkedIn health check failed: ${response.status}`)
      } else if (conn.platform === 'x') {
        const response = await fetch('https://api.x.com/2/users/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        })
        healthy = response.ok
        if (!healthy) job.log(`X health check failed: ${response.status}`)
      }

      const newHealth = healthy ? 'healthy' : 'expired'
      await db
        .update(platformConnections)
        .set({
          connectionHealth: newHealth,
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, conn.id))

      if (healthy) {
        healthyCount++
      } else {
        expiredCount++
        const prefs = await db.query.notificationPreferences.findFirst({
          where: and(
            eq(notificationPreferences.userId, conn.userId),
            eq(notificationPreferences.telegramEnabled, true),
            eq(notificationPreferences.notifyConnectionHealth, true),
          ),
        })
        if (prefs?.telegramChatId) {
          await sendConnectionHealthAlert(
            prefs.telegramChatId,
            conn.platform,
            'expired',
            'Token invalid or revoked',
          )
        }
      }

      // Check upcoming token expiry
      if (conn.tokenExpiresAt) {
        const daysLeft = Math.ceil(
          (conn.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
        if (daysLeft > 0 && daysLeft <= 7) {
          job.log(`${conn.platform} token for user ${conn.userId} expires in ${daysLeft} days`)

          const prefs = await db.query.notificationPreferences.findFirst({
            where: and(
              eq(notificationPreferences.userId, conn.userId),
              eq(notificationPreferences.telegramEnabled, true),
              eq(notificationPreferences.notifyTokenExpiry, true),
            ),
          })
          if (prefs?.telegramChatId) {
            await sendTokenExpiryWarning(prefs.telegramChatId, conn.platform, daysLeft)
          }
        }
      }
    } catch (error: unknown) {
      degradedCount++
      const msg = error instanceof Error ? error.message : 'Unknown error'
      job.log(`Health check error for ${conn.platform} (user ${conn.userId}): ${msg}`)
      await db
        .update(platformConnections)
        .set({
          connectionHealth: 'degraded',
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(platformConnections.id, conn.id))
    }
  }

  job.log(
    `Health check complete: ${healthyCount} healthy, ${degradedCount} degraded, ${expiredCount} expired`,
  )
  return { healthy: healthyCount, degraded: degradedCount, expired: expiredCount }
}

export const connectionHealthWorker = new Worker('connection-health', withErrorHandling('connection-health', processConnectionHealth), {
  connection,
  concurrency: 1,
})

export async function scheduleConnectionHealth() {
  const queue = new Queue('connection-health', { connection })
  await queue.upsertJobScheduler(
    'connection-health-daily',
    { pattern: '30 5 * * *' },
    { name: 'connection-health' },
  )
}
