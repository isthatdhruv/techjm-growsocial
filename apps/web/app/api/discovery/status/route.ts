import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, rawTopics } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { discoveryMergeQueue } from '@/lib/queue-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runId = request.nextUrl.searchParams.get('runId');
    const mergeJobId = request.nextUrl.searchParams.get('mergeJobId');
    const slotsTotal = Math.max(
      Number.parseInt(request.nextUrl.searchParams.get('slotsTotal') || '4', 10) || 4,
      1,
    );
    if (!runId) {
      return NextResponse.json({ error: 'Missing runId parameter' }, { status: 400 });
    }

    // Query all raw topics for this run
    const topics = await db
      .select()
      .from(rawTopics)
      .where(and(eq(rawTopics.userId, user.id), eq(rawTopics.discoveryRunId, runId)));

    const mergeJob = mergeJobId ? await discoveryMergeQueue.getJob(mergeJobId) : null;
    const mergeState = mergeJob ? await mergeJob.getState() : null;
    console.info(
      `[discovery/status] user=${user.id} run=${runId} topics=${topics.length} mergeState=${mergeState || 'unknown'}`,
    );

    if (topics.length === 0) {
      if (mergeState === 'completed') {
        return NextResponse.json({
          status: 'complete',
          slotsCompleted: slotsTotal,
          slotsTotal,
          topicsFound: 0,
          topicsAfterMerge: 0,
          topTopics: [],
        });
      }

      if (mergeState === 'failed') {
        return NextResponse.json({
          status: 'failed',
          slotsCompleted: 0,
          slotsTotal,
          topicsFound: 0,
          error: 'Discovery finished without producing topics. Check worker logs and provider configuration.',
        });
      }

      return NextResponse.json({
        status: 'running',
        slotsCompleted: 0,
        slotsTotal,
        topicsFound: 0,
      });
    }

    // Count unique slots that have produced topics
    const completedSlots = new Set(topics.map((t) => t.sourceLlm)).size;

    // Check if merge is complete (consensus_tier is set)
    const mergedTopics = topics.filter((t) => t.consensusTier !== null);
    const mergeComplete = mergedTopics.length > 0;

    if (!mergeComplete) {
      if (mergeState === 'failed') {
        return NextResponse.json({
          status: 'failed',
          slotsCompleted: completedSlots,
          slotsTotal,
          topicsFound: topics.length,
          error: 'Discovery collected topics but the merge step failed. Check worker logs for the merge job.',
        });
      }

      return NextResponse.json({
        status: 'running',
        slotsCompleted: completedSlots,
        slotsTotal,
        topicsFound: topics.length,
      });
    }

    // Merge is done — return full summary
    const sorted = mergedTopics.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));

    return NextResponse.json({
      status: 'complete',
      slotsCompleted: completedSlots,
      slotsTotal,
      topicsFound: topics.length,
      topicsAfterMerge: mergedTopics.length,
      topTopics: sorted.slice(0, 5).map((t) => ({
        title: t.title,
        angle: t.angle,
        consensusTier: t.consensusTier,
        consensusCount: t.consensusCount,
        sourceUrls: t.sourceUrls,
      })),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error(`[discovery/status] failed: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
