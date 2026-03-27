import { Worker, Job, Queue } from 'bullmq'
import { db, platformConnections, decrypt, encrypt } from '@techjm/db'
import { lt, and, isNotNull, eq } from 'drizzle-orm'
import { connection } from '../../redis.js'
import { withErrorHandling } from '../../lib/error-handler.js'

async function processTokenRefresh(job: Job) {
  const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const expiringConnections = await db.query.platformConnections.findMany({
    where: and(
      lt(platformConnections.tokenExpiresAt, twoWeeksFromNow),
      isNotNull(platformConnections.refreshTokenEnc),
    ),
  })

  job.log(`Found ${expiringConnections.length} connections needing token refresh`)

  let refreshedCount = 0
  let failedCount = 0

  for (const conn of expiringConnections) {
    try {
      let success = false

      if (conn.platform === 'linkedin') {
        success = await refreshLinkedInToken(conn)
      } else if (conn.platform === 'x') {
        success = await refreshXToken(conn)
      }

      if (success) {
        refreshedCount++
        job.log(`Refreshed ${conn.platform} token for user ${conn.userId}`)
      } else {
        failedCount++
        job.log(`Failed to refresh ${conn.platform} token for user ${conn.userId}`)
      }
    } catch (error: unknown) {
      failedCount++
      const msg = error instanceof Error ? error.message : 'Unknown error'
      job.log(`Token refresh error for ${conn.platform} (user ${conn.userId}): ${msg}`)
    }
  }

  return { refreshed: refreshedCount, failed: failedCount, total: expiringConnections.length }
}

async function refreshLinkedInToken(conn: typeof platformConnections.$inferSelect): Promise<boolean> {
  if (!conn.refreshTokenEnc) return false
  const refreshToken = decrypt(conn.refreshTokenEnc)

  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) return false
  const data = await response.json()

  await db
    .update(platformConnections)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : conn.refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      connectionHealth: 'healthy',
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, conn.id))

  return true
}

async function refreshXToken(conn: typeof platformConnections.$inferSelect): Promise<boolean> {
  if (!conn.refreshTokenEnc) return false
  const refreshToken = decrypt(conn.refreshTokenEnc)

  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) return false
  const data = await response.json()

  await db
    .update(platformConnections)
    .set({
      accessTokenEnc: encrypt(data.access_token),
      refreshTokenEnc: data.refresh_token ? encrypt(data.refresh_token) : conn.refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      connectionHealth: 'healthy',
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(platformConnections.id, conn.id))

  return true
}

export const tokenRefreshWorker = new Worker('token-refresh', withErrorHandling('token-refresh', processTokenRefresh), {
  connection,
  concurrency: 1,
})

export async function scheduleTokenRefresh() {
  const queue = new Queue('token-refresh', { connection })
  await queue.upsertJobScheduler(
    'token-refresh-weekly',
    { pattern: '0 3 * * 0' },
    { name: 'token-refresh' },
  )
}
