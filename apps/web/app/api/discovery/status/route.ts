import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, rawTopics } from '@techjm/db';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runId = request.nextUrl.searchParams.get('runId');
    if (!runId) {
      return NextResponse.json({ error: 'Missing runId parameter' }, { status: 400 });
    }

    // Query all raw topics for this run
    const topics = await db
      .select()
      .from(rawTopics)
      .where(and(eq(rawTopics.userId, user.id), eq(rawTopics.discoveryRunId, runId)));

    if (topics.length === 0) {
      return NextResponse.json({
        status: 'running',
        slotsCompleted: 0,
        slotsTotal: 4,
        topicsFound: 0,
      });
    }

    // Count unique slots that have produced topics
    const completedSlots = new Set(topics.map((t) => t.sourceLlm)).size;

    // Check if merge is complete (consensus_tier is set)
    const mergedTopics = topics.filter((t) => t.consensusTier !== null);
    const mergeComplete = mergedTopics.length > 0;

    if (!mergeComplete) {
      return NextResponse.json({
        status: 'running',
        slotsCompleted: completedSlots,
        slotsTotal: 4,
        topicsFound: topics.length,
      });
    }

    // Merge is done — return full summary
    const sorted = mergedTopics.sort((a, b) => (b.consensusCount ?? 0) - (a.consensusCount ?? 0));

    return NextResponse.json({
      status: 'complete',
      slotsCompleted: completedSlots,
      slotsTotal: 4,
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
    console.error('Discovery status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
