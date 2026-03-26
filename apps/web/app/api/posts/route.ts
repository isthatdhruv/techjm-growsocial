import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and, desc, asc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'review';
  const platform = searchParams.get('platform') || 'all';
  const sort = searchParams.get('sort') || 'newest';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Build conditions
  const conditions = [eq(posts.userId, user.id)];

  if (status !== 'all') {
    conditions.push(eq(posts.status, status as any));
  }

  if (platform !== 'all') {
    conditions.push(eq(posts.platform, platform as any));
  }

  const whereClause = and(...conditions);

  // Determine sort order
  const orderBy =
    sort === 'oldest'
      ? asc(posts.createdAt)
      : sort === 'scheduled'
        ? asc(posts.scheduledAt)
        : desc(posts.createdAt);

  // Query posts with joined topic data
  const results = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      caption: posts.caption,
      hashtags: posts.hashtags,
      imagePrompt: posts.imagePrompt,
      imageUrl: posts.imageUrl,
      imageUrls: posts.imageUrls,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      topicId: posts.topicId,
      topicTitle: rawTopics.title,
      topicAngle: rawTopics.angle,
      finalScore: scoredTopics.finalScore,
      consensusMultiplier: scoredTopics.consensusMultiplier,
    })
    .from(posts)
    .leftJoin(scoredTopics, eq(posts.topicId, scoredTopics.id))
    .leftJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(whereClause);

  return NextResponse.json({
    posts: results,
    total: countResult?.count || 0,
    limit,
    offset,
  });
}
