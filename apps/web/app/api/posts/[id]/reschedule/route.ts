import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { publishQueue, PublishJobData } from '@/lib/queue-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, id), eq(posts.userId, user.id)),
  });

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled posts can be rescheduled' }, { status: 400 });
  }

  const body = await request.json();
  const { scheduledAt } = body;

  if (!scheduledAt) {
    return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 });
  }

  const scheduledDate = new Date(scheduledAt);
  const delay = scheduledDate.getTime() - Date.now();

  if (delay < 60_000) {
    return NextResponse.json(
      { error: 'scheduledAt must be at least 1 minute in the future' },
      { status: 400 },
    );
  }

  // Cancel existing BullMQ job
  const existingJob = await publishQueue.getJob(`publish-${id}`);
  if (existingJob) {
    await existingJob.remove();
  }

  // Create new delayed job
  await publishQueue.add(
    `publish-${id}`,
    {
      userId: user.id,
      postId: id,
      platform: post.platform as 'linkedin' | 'x',
      scheduledAt: scheduledDate.toISOString(),
      retryCount: 0,
    } satisfies PublishJobData,
    {
      delay,
      jobId: `publish-${id}`,
      attempts: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );

  await db
    .update(posts)
    .set({
      scheduledAt: scheduledDate,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  return NextResponse.json({
    success: true,
    rescheduledTo: scheduledDate.toISOString(),
  });
}
