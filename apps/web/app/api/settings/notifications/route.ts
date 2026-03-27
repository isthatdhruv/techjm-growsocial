import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, user.id),
  })

  return NextResponse.json({ preferences: prefs || null })
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  const booleanFields = [
    'notifyDailyDigest', 'notifyPublishSuccess', 'notifyPublishFailure',
    'notifyTokenExpiry', 'notifyWeeklyReport', 'notifyConnectionHealth',
    'telegramEnabled',
  ] as const
  for (const field of booleanFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  if (body.digestTime !== undefined) updates.digestTime = body.digestTime
  if (body.timezone !== undefined) updates.timezone = body.timezone

  const existing = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, user.id),
  })

  if (existing) {
    await db.update(notificationPreferences)
      .set(updates)
      .where(eq(notificationPreferences.userId, user.id))
  } else {
    await db.insert(notificationPreferences).values({
      userId: user.id,
      ...updates,
    })
  }

  const updated = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, user.id),
  })

  return NextResponse.json({ preferences: updated })
}
