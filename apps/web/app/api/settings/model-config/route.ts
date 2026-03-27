import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, userModelConfig, userAiKeys } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, user.id),
  })

  return NextResponse.json({ config: config || null })
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Validate that assigned providers have valid keys
  const userKeys = await db.query.userAiKeys.findMany({
    where: eq(userAiKeys.userId, user.id),
    columns: { provider: true },
  })
  const validProviders = new Set<string>(userKeys.map(k => k.provider))

  const slotFields = ['slotA', 'slotB', 'slotC', 'slotD', 'subAgentModel', 'captionModel', 'imageModel'] as const
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  for (const field of slotFields) {
    if (body[field] !== undefined) {
      const val = body[field] as { provider?: string; model?: string } | null
      if (val && val.provider && !validProviders.has(val.provider)) {
        return NextResponse.json(
          { error: `No valid key for provider: ${val.provider}` },
          { status: 400 },
        )
      }
      updates[field] = val
    }
  }

  const existing = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, user.id),
  })

  if (existing) {
    await db.update(userModelConfig)
      .set(updates)
      .where(eq(userModelConfig.userId, user.id))
  } else {
    await db.insert(userModelConfig).values({
      userId: user.id,
      ...updates,
    })
  }

  const config = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, user.id),
  })

  return NextResponse.json({ config })
}
