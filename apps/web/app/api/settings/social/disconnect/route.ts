import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, platformConnections } from '@techjm/db'
import { eq, and } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { platform } = await request.json()
  if (!platform || !['linkedin', 'x'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  await db.delete(platformConnections)
    .where(and(
      eq(platformConnections.userId, user.id),
      eq(platformConnections.platform, platform),
    ))

  return NextResponse.json({ success: true })
}
