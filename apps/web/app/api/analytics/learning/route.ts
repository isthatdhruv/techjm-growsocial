import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, scoringWeights, scoringFeedback, userNicheProfiles } from '@techjm/db'
import { eq, desc, sql } from 'drizzle-orm'

const DEFAULT_WEIGHTS: Record<string, number> = {
  sentiment: 0.15,
  audience_fit: 0.2,
  seo: 0.15,
  competitor_gap: 0.15,
  content_market_fit: 0.2,
  engagement_pred: 0.15,
}

function getStage(count: number): {
  stage: 'collecting' | 'adjusting' | 'learning' | 'optimized'
  postsUntilNextStage: number
} {
  if (count < 10) return { stage: 'collecting', postsUntilNextStage: 10 - count }
  if (count < 30) return { stage: 'adjusting', postsUntilNextStage: 30 - count }
  if (count < 75) return { stage: 'learning', postsUntilNextStage: 75 - count }
  return { stage: 'optimized', postsUntilNextStage: 0 }
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Count feedback posts
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(scoringFeedback)
    .where(eq(scoringFeedback.userId, user.id))

  const totalPosts = Number(countResult[0]?.count || 0)
  const maturity = { totalPosts, ...getStage(totalPosts) }

  // 2. Load current weights
  const weightRows = await db.query.scoringWeights.findMany({
    where: eq(scoringWeights.userId, user.id),
  })

  const currentWeights: Record<string, number> = { ...DEFAULT_WEIGHTS }
  let lastUpdated: string | null = null
  for (const row of weightRows) {
    currentWeights[row.dimension] = parseFloat(row.weight)
    if (row.updatedAt) {
      const ts = row.updatedAt.toISOString()
      if (!lastUpdated || ts > lastUpdated) lastUpdated = ts
    }
  }

  // 3. Load learned patterns and optimal times from brand_kit
  const niche = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  })

  const brandKit = (niche?.brandKit as Record<string, unknown>) || {}
  const patterns = (brandKit.learned_patterns as Record<string, unknown>) || null
  const optimalTimes = (brandKit.optimal_times as Record<string, unknown>) || null

  // 4. Load last 10 feedback records
  const feedbackRows = await db.query.scoringFeedback.findMany({
    where: eq(scoringFeedback.userId, user.id),
    orderBy: [desc(scoringFeedback.createdAt)],
    limit: 10,
  })

  const records = feedbackRows.map((r) => ({
    postId: r.postId,
    predicted: parseFloat(r.predictedScore || '0'),
    actual: parseFloat(r.actualEngagement || '0'),
    delta: parseFloat(r.scoreDelta || '0'),
    date: r.createdAt?.toISOString() || '',
  }))

  return NextResponse.json({
    maturity,
    weights: {
      current: currentWeights,
      defaults: DEFAULT_WEIGHTS,
      lastUpdated,
    },
    patterns,
    optimalTimes,
    feedbackHistory: { records },
  })
}
