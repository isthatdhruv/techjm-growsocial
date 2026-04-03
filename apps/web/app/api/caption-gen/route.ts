import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { queueTopicContentGeneration } from '@/lib/content-jobs';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const topicId = body?.topicId;

  if (!topicId || typeof topicId !== 'string') {
    return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
  }

  try {
    const { platforms, jobId } = await queueTopicContentGeneration(user.id, topicId);
    return NextResponse.json({
      success: true,
      topicId,
      platforms,
      jobId,
      message: 'Content generation queued',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to queue generation' },
      { status: 400 },
    );
  }
}
