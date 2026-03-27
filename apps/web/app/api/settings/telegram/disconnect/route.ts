import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db.update(notificationPreferences)
    .set({ telegramChatId: null, telegramEnabled: false, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, user.id))

  return NextResponse.json({ success: true })
}
