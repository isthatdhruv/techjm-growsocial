import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, userNicheProfiles, scoringWeights } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  })

  return NextResponse.json({ profile: profile || null })
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { niche, pillars, audience, tone, competitors, antiTopics, examplePosts, resetWeights } = body

  const existing = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (niche !== undefined) updates.niche = niche
  if (pillars !== undefined) updates.pillars = pillars
  if (audience !== undefined) updates.audience = audience
  if (tone !== undefined) updates.tone = tone
  if (competitors !== undefined) updates.competitors = competitors
  if (antiTopics !== undefined) updates.antiTopics = antiTopics
  if (examplePosts !== undefined) updates.examplePosts = examplePosts

  if (existing) {
    await db.update(userNicheProfiles)
      .set(updates)
      .where(eq(userNicheProfiles.userId, user.id))

    // If niche changed and user wants to reset weights
    if (resetWeights && niche && niche !== existing.niche) {
      await db.delete(scoringWeights).where(eq(scoringWeights.userId, user.id))
    }
  } else {
    await db.insert(userNicheProfiles).values({
      userId: user.id,
      niche: niche || 'General',
      pillars: pillars || ['General'],
      audience: audience || '',
      tone: tone || 'professional',
      ...updates,
    })
  }

  const updated = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  })

  return NextResponse.json({ profile: updated })
}
