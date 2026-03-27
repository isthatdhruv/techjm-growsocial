import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { redis } from '@/lib/redis'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  await redis.set(`telegram_link:${code}`, user.id, 'EX', 600)

  return NextResponse.json({
    code,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || 'TechJMBot',
    expiresIn: 600,
  })
}
