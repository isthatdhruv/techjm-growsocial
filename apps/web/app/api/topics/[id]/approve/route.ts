import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, scoredTopics } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { queueTopicContentGeneration } from '@/lib/content-jobs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    console.info(`[topics/approve] start user=${user.id} topic=${id}`);

    // Verify topic belongs to this user
    const topic = await db.query.scoredTopics.findFirst({
      where: and(eq(scoredTopics.id, id), eq(scoredTopics.userId, user.id)),
    });

    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    try {
      const { platforms, jobId } = await queueTopicContentGeneration(user.id, id);

      return NextResponse.json({
        success: true,
        status: 'approved',
        message: 'Content generation started',
        platforms,
        jobId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Content generation queue failed';

      console.error(
        `[topics/approve] queue failed user=${user.id} topic=${id}: ${errorMessage}`,
      );

      await db
        .update(scoredTopics)
        .set({ status: 'approved' })
        .where(eq(scoredTopics.id, id));

      return NextResponse.json({
        success: true,
        status: 'approved',
        message: `Topic approved, but content generation could not be queued: ${errorMessage}`,
        platforms: [],
        queueError: errorMessage,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[topics/approve] failed: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
