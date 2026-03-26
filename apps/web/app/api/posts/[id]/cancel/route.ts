import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { publishQueue } from '@/lib/queue-client';

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
    return NextResponse.json({ error: 'Only scheduled posts can be cancelled' }, { status: 400 });
  }

  // Remove BullMQ job
  const existingJob = await publishQueue.getJob(`publish-${id}`);
  if (existingJob) {
    await existingJob.remove();
  }

  // Revert post status back to review
  await db
    .update(posts)
    .set({
      status: 'review',
      scheduledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  return NextResponse.json({
    success: true,
    message: 'Schedule cancelled. Post moved back to review.',
  });
}
