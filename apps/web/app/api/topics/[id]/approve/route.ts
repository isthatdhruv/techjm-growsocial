import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, scoredTopics, platformConnections } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { captionGenQueue } from '@/lib/queue-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify topic belongs to this user
  const topic = await db.query.scoredTopics.findFirst({
    where: and(eq(scoredTopics.id, id), eq(scoredTopics.userId, user.id)),
  });

  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  // Update status to approved
  await db
    .update(scoredTopics)
    .set({ status: 'approved' })
    .where(eq(scoredTopics.id, id));

  // Determine which platforms the user has connected
  const connections = await db.query.platformConnections.findMany({
    where: and(
      eq(platformConnections.userId, user.id),
      eq(platformConnections.connectionHealth, 'healthy'),
    ),
  });

  let platforms = connections
    .map((c) => c.platform)
    .filter((p): p is 'linkedin' | 'x' => p === 'linkedin' || p === 'x');

  if (platforms.length === 0) {
    // No connected platforms — generate for both anyway
    platforms = ['linkedin', 'x'];
  }

  // Queue caption generation (starts the caption → image-prompt → image pipeline)
  await captionGenQueue.add(
    `caption-${id}`,
    {
      userId: user.id,
      scoredTopicId: id,
      rawTopicId: topic.rawTopicId,
      platforms,
    },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
    },
  );

  return NextResponse.json({
    success: true,
    status: 'approved',
    message: 'Content generation started',
    platforms,
  });
}
