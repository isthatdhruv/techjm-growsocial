import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getAdminAuth } from '@/lib/firebase-admin'
import { db, users, userNicheProfiles, userAiKeys, userModelConfig, platformConnections, rawTopics, scoredTopics, scoringFeedback, scoringWeights, posts, publishLog, topicPerformance, notificationPreferences } from '@techjm/db'
import { eq } from 'drizzle-orm'

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (body.confirmation !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 })
  }

  // Delete in reverse FK order
  await db.delete(topicPerformance).where(eq(topicPerformance.postId,
    db.select({ id: posts.id }).from(posts).where(eq(posts.userId, user.id)) as any
  )).catch(() => {})

  // Simpler approach: delete each table for this user
  const userPosts = await db.query.posts.findMany({ where: eq(posts.userId, user.id), columns: { id: true } })
  for (const p of userPosts) {
    await db.delete(topicPerformance).where(eq(topicPerformance.postId, p.id))
    await db.delete(publishLog).where(eq(publishLog.postId, p.id))
  }
  await db.delete(posts).where(eq(posts.userId, user.id))
  await db.delete(scoringFeedback).where(eq(scoringFeedback.userId, user.id))
  await db.delete(scoringWeights).where(eq(scoringWeights.userId, user.id))
  await db.delete(scoredTopics).where(eq(scoredTopics.userId, user.id))
  await db.delete(rawTopics).where(eq(rawTopics.userId, user.id))
  await db.delete(notificationPreferences).where(eq(notificationPreferences.userId, user.id))
  await db.delete(platformConnections).where(eq(platformConnections.userId, user.id))
  await db.delete(userModelConfig).where(eq(userModelConfig.userId, user.id))
  await db.delete(userAiKeys).where(eq(userAiKeys.userId, user.id))
  await db.delete(userNicheProfiles).where(eq(userNicheProfiles.userId, user.id))
  await db.delete(users).where(eq(users.id, user.id))

  // Delete Firebase auth user
  try {
    await getAdminAuth().deleteUser(user.firebaseUid)
  } catch {
    // Firebase user may already be deleted
  }

  return NextResponse.json({ success: true, redirect: '/' })
}
