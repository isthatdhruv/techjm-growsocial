import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { withRateLimit } from '@/lib/rate-limit';
import { db, posts, platformConnections } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { publishQueue, PublishJobData } from '@/lib/queue-client';
import { getPublishConnectionError } from '@/lib/social-publish';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitResponse = await withRateLimit(user.id, 'publish:post');
  if (rateLimitResponse) return rateLimitResponse;

  const { id } = await params;

  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, id), eq(posts.userId, user.id)),
  });

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const connection = await db.query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.userId, user.id),
      eq(platformConnections.platform, post.platform as 'linkedin' | 'x'),
    ),
    columns: {
      connectionHealth: true,
    },
  });

  const publishConnectionError = getPublishConnectionError(
    connection,
    post.platform as 'linkedin' | 'x',
  );
  if (publishConnectionError) {
    return NextResponse.json(
      { error: publishConnectionError },
      { status: 400 },
    );
  }

  await publishQueue.add(
    `publish-now-${id}`,
    {
      userId: user.id,
      postId: id,
      platform: post.platform as 'linkedin' | 'x',
      scheduledAt: new Date().toISOString(),
      retryCount: 0,
    } satisfies PublishJobData,
    {
      delay: 0,
      attempts: 1,
      removeOnComplete: { count: 500 },
    },
  );

  return NextResponse.json({ success: true, message: 'Publishing now...' });
}
