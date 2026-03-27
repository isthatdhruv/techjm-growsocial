import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, user.id),
  })

  if (!prefs?.telegramChatId) {
    return NextResponse.json({ error: 'Telegram not connected' }, { status: 400 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: prefs.telegramChatId,
      text: '🔔 Test from TechJM! Notifications are working.',
    }),
  })

  return NextResponse.json({ sent: true })
}
