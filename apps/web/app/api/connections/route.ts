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
      platform: true,
      accountName: true,
      connectionHealth: true,
      tokenExpiresAt: true,
      lastHealthCheck: true,
      orgUrn: true,
    },
  })

  return NextResponse.json({ connections })
}
