import { NextRequest, NextResponse } from 'next/server'
import { db, notificationPreferences, scoredTopics, posts } from '@techjm/db'
import { eq, and, gte, sql } from 'drizzle-orm'
import { redis } from '@/lib/redis'

export async function POST(request: NextRequest) {
  const update = await request.json()
  const chatId = update.message?.chat?.id?.toString()
  const text = update.message?.text || ''

  if (!chatId) return NextResponse.json({ ok: true })

  if (text.startsWith('/start') || text.startsWith('/link')) {
    const code = text.split(' ')[1]?.trim()

    if (!code) {
      await sendTelegramReply(chatId, "👋 Welcome to TechJM!\n\nTo connect your account:\n1. Go to Settings → Notifications in your dashboard\n2. Click 'Generate Code'\n3. Send here: /link YOUR_CODE")
      return NextResponse.json({ ok: true })
    }

    const userId = await redis.get(`telegram_link:${code}`)
    if (!userId) {
      await sendTelegramReply(chatId, "❌ Invalid or expired code. Generate a new one in Settings → Notifications.")
      return NextResponse.json({ ok: true })
    }

    await db.insert(notificationPreferences)
      .values({ userId, telegramChatId: chatId, telegramEnabled: true })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId],
        set: { telegramChatId: chatId, telegramEnabled: true, updatedAt: new Date() },
      })

    await redis.del(`telegram_link:${code}`)

    await sendTelegramReply(chatId, "✅ Connected! You'll receive notifications here.\n\nCommands:\n/status — Pipeline status\n/stop — Pause notifications\n/start — Resume")
    return NextResponse.json({ ok: true })
  }

  if (text === '/stop') {
    await db.update(notificationPreferences)
      .set({ telegramEnabled: false, updatedAt: new Date() })
      .where(eq(notificationPreferences.telegramChatId, chatId))
    await sendTelegramReply(chatId, "🔕 Notifications paused. Send /start to resume.")
    return NextResponse.json({ ok: true })
  }

  if (text === '/status') {
    const prefs = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.telegramChatId, chatId)
    })
    if (!prefs) {
      await sendTelegramReply(chatId, "Not connected. Use /link CODE to connect.")
      return NextResponse.json({ ok: true })
    }

    const pendingCount = await db.select({ count: sql<number>`count(*)` })
      .from(scoredTopics)
      .where(and(eq(scoredTopics.userId, prefs.userId), eq(scoredTopics.status, 'pending')))

    const scheduledCount = await db.select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(and(eq(posts.userId, prefs.userId), eq(posts.status, 'scheduled')))

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const publishedTodayCount = await db.select({ count: sql<number>`count(*)` })
      .from(posts)
      .where(and(
        eq(posts.userId, prefs.userId),
        eq(posts.status, 'published'),
        gte(posts.publishedAt, todayStart)
      ))

    await sendTelegramReply(chatId,
      `📊 *Status*\n\n🔍 Pending topics: ${pendingCount[0]?.count || 0}\n📅 Scheduled posts: ${scheduledCount[0]?.count || 0}\n✅ Published today: ${publishedTodayCount[0]?.count || 0}`)
    return NextResponse.json({ ok: true })
  }

  await sendTelegramReply(chatId, "Commands:\n/link CODE — Connect account\n/status — Pipeline status\n/stop — Pause notifications\n/start — Resume")
  return NextResponse.json({ ok: true })
}

async function sendTelegramReply(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(err => console.error('Telegram reply failed:', err.message))
}
