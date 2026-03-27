import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { db, userNicheProfiles, platformConnections, posts, scoredTopics, scoringWeights, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  })

  const connections = await db.query.platformConnections.findMany({
    where: eq(platformConnections.userId, user.id),
    columns: { platform: true, accountName: true, connectionHealth: true, createdAt: true },
  })

  const userPosts = await db.query.posts.findMany({
    where: eq(posts.userId, user.id),
  })

  const topics = await db.query.scoredTopics.findMany({
    where: eq(scoredTopics.userId, user.id),
  })

  const weights = await db.query.scoringWeights.findMany({
    where: eq(scoringWeights.userId, user.id),
  })

  const prefs = await db.query.notificationPreferences.findFirst({
    where: eq(notificationPreferences.userId, user.id),
  })

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, createdAt: user.createdAt },
    nicheProfile: profile,
    connections,
    posts: userPosts,
    scoredTopics: topics,
    scoringWeights: weights,
    notificationPreferences: prefs,
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="techjm-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  })
}
