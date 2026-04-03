import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, platformConnections } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const connections = await db.query.platformConnections.findMany({
    where: eq(platformConnections.userId, user.id),
    columns: {
      connectionHealth: true,
      tokenExpiresAt: true,
    },
  })

  const hasIssues = connections.some(c => c.connectionHealth === 'expired' || c.connectionHealth === 'degraded')
  const expiringSoon = connections.some(c => {
    if (!c.tokenExpiresAt) return false
    const daysLeft = Math.ceil((c.tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysLeft > 0 && daysLeft <= 7
  })

  return NextResponse.json({ hasIssues, expiringSoon })
}
