import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'scheduled';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const conditions = [eq(posts.userId, user.id)];

  // Map queue tabs to post statuses
  const statusMap: Record<string, string[]> = {
    upcoming: ['scheduled'],
    publishing: ['publishing'],
    published: ['published'],
    failed: ['failed'],
  };

  const statuses = statusMap[status] || [status];
  if (statuses.length === 1) {
    conditions.push(eq(posts.status, statuses[0] as typeof posts.status.enumValues[number]));
  } else {
    conditions.push(inArray(posts.status, statuses as typeof posts.status.enumValues[number][]));
  }

  const whereClause = and(...conditions);

  // Sort: upcoming by scheduledAt ASC, published by publishedAt DESC, failed by updatedAt DESC
  let orderBy;
  if (status === 'upcoming' || status === 'scheduled') {
    orderBy = asc(posts.scheduledAt);
  } else if (status === 'published') {
    orderBy = desc(posts.publishedAt);
  } else {
    orderBy = desc(posts.updatedAt);
  }

  const results = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      caption: posts.caption,
      imageUrl: posts.imageUrl,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      publishedAt: posts.publishedAt,
      externalId: posts.externalId,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      topicTitle: rawTopics.title,
      finalScore: scoredTopics.finalScore,
    })
    .from(posts)
    .leftJoin(scoredTopics, eq(posts.topicId, scoredTopics.id))
    .leftJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

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
