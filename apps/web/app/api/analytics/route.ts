import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts, topicPerformance, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and, gte, lt, inArray, desc } from 'drizzle-orm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseRange(range: string): { startDate: Date | null; durationMs: number | null } {
  const now = new Date();
  switch (range) {
    case '7d': {
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate, durationMs: 7 * 24 * 60 * 60 * 1000 };
    }
    case '90d': {
      const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { startDate, durationMs: 90 * 24 * 60 * 60 * 1000 };
    }
    case 'all': {
      return { startDate: null, durationMs: null };
    }
    case '30d':
    default: {
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate, durationMs: 30 * 24 * 60 * 60 * 1000 };
    }
  }
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildExternalUrl(platform: string, externalId: string | null): string {
  if (!externalId) return '';
  if (platform === 'linkedin') return `https://www.linkedin.com/feed/update/${externalId}`;
  if (platform === 'x') return `https://x.com/status/${externalId}`;
  return '';
}

function extractPillar(subAgentOutputs: unknown): string | null {
  if (!subAgentOutputs || typeof subAgentOutputs !== 'object') return null;
  const outputs = subAgentOutputs as Record<string, unknown>;
  const pillarBalancer = outputs['pillar_balancer'];
  if (!pillarBalancer || typeof pillarBalancer !== 'object') return null;
  const pb = pillarBalancer as Record<string, unknown>;
  return typeof pb['pillar'] === 'string' ? pb['pillar'] : null;
}

// ─── GET /api/analytics ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get('range') || '30d';
  const platform = searchParams.get('platform') || 'all';

  const { startDate, durationMs } = parseRange(range);

  // ── 1. Query published posts in range ──────────────────────────────────────
  const postConditions = [
    eq(posts.userId, user.id),
    eq(posts.status, 'published'),
  ];
  if (startDate) {
    postConditions.push(gte(posts.publishedAt, startDate));
  }
  if (platform !== 'all') {
    postConditions.push(eq(posts.platform, platform as 'linkedin' | 'x'));
  }

  const postsResult = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      caption: posts.caption,
      publishedAt: posts.publishedAt,
      externalId: posts.externalId,
      topicId: posts.topicId,
      topicTitle: rawTopics.title,
      finalScore: scoredTopics.finalScore,
      consensusTier: rawTopics.consensusTier,
      subAgentOutputs: scoredTopics.subAgentOutputs,
    })
    .from(posts)
    .leftJoin(scoredTopics, eq(posts.topicId, scoredTopics.id))
    .leftJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(and(...postConditions))
    .orderBy(desc(posts.publishedAt));

  const postIds = postsResult.map((p) => p.id);

  // ── 2. Query all checkpoints for those posts ───────────────────────────────
  type CheckpointRow = {
    postId: string;
    checkpoint: string;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    engagementScore: string | null;
    measuredAt: Date | null;
  };

  let checkpointRows: CheckpointRow[] = [];
  if (postIds.length > 0) {
    checkpointRows = await db
      .select({
        postId: topicPerformance.postId,
        checkpoint: topicPerformance.checkpoint,
        impressions: topicPerformance.impressions,
        likes: topicPerformance.likes,
        comments: topicPerformance.comments,
        shares: topicPerformance.shares,
        engagementScore: topicPerformance.engagementScore,
        measuredAt: topicPerformance.measuredAt,
      })
      .from(topicPerformance)
      .where(inArray(topicPerformance.postId, postIds))
      .orderBy(desc(topicPerformance.measuredAt));
  }

  // Group checkpoints by postId
  const checkpointsByPost = new Map<string, CheckpointRow[]>();
  for (const row of checkpointRows) {
    if (!checkpointsByPost.has(row.postId)) {
      checkpointsByPost.set(row.postId, []);
    }
    checkpointsByPost.get(row.postId)!.push(row);
  }

  // ── 3. Build posts array ───────────────────────────────────────────────────
  // Collect all latestScores to compute the user's overall average
  const latestScores: number[] = [];
  for (const post of postsResult) {
    const checkpoints = checkpointsByPost.get(post.id);
    if (checkpoints && checkpoints.length > 0) {
      const latest = checkpoints[0]; // already desc by measuredAt
      const score = latest.engagementScore !== null ? parseFloat(latest.engagementScore) : 0;
      latestScores.push(score);
    }
  }

  const overallAvg = latestScores.length > 0
    ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length
    : 0;

  const builtPosts = postsResult
    .filter((post) => {
      const cps = checkpointsByPost.get(post.id);
      return cps && cps.length > 0;
    })
    .map((post) => {
      const checkpoints = checkpointsByPost.get(post.id)!;
      const latestCheckpoint = checkpoints[0];
      const latestScore = latestCheckpoint.engagementScore !== null
        ? parseFloat(latestCheckpoint.engagementScore)
        : 0;

      let trend: 'up' | 'down' | 'flat' = 'flat';
      if (overallAvg > 0) {
        const ratio = (latestScore - overallAvg) / overallAvg;
        if (ratio > 0.1) trend = 'up';
        else if (ratio < -0.1) trend = 'down';
      }

      return {
        id: post.id,
        platform: post.platform,
        caption: post.caption.slice(0, 100),
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        externalUrl: buildExternalUrl(post.platform, post.externalId ?? null),
        topicTitle: post.topicTitle ?? null,
        topicScore: post.finalScore !== null ? parseFloat(post.finalScore as string) : null,
        consensusTier: post.consensusTier ?? null,
        checkpoints: checkpoints.map((cp) => ({
          checkpoint: cp.checkpoint,
          impressions: cp.impressions ?? 0,
          likes: cp.likes ?? 0,
          comments: cp.comments ?? 0,
          shares: cp.shares ?? 0,
          score: cp.engagementScore !== null ? parseFloat(cp.engagementScore) : 0,
        })),
        latestScore,
        trend,
      };
    });

  // ── 4. Summary stats ───────────────────────────────────────────────────────
  const totalEngagement = latestScores.reduce((a, b) => a + b, 0);
  const totalPosts = builtPosts.length;
  const avgPerPost = totalPosts > 0 ? totalEngagement / totalPosts : 0;

  // trendPercent: compare current period avg to previous period avg
  let trendPercent = 0;
  if (startDate && durationMs) {
    const prevEnd = startDate;
    const prevStart = new Date(startDate.getTime() - durationMs);

    const prevConditions = [
      eq(posts.userId, user.id),
      eq(posts.status, 'published'),
      gte(posts.publishedAt, prevStart),
      lt(posts.publishedAt, prevEnd),
    ];
    if (platform !== 'all') {
      prevConditions.push(eq(posts.platform, platform as 'linkedin' | 'x'));
    }

    const prevPostsResult = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(...prevConditions));

    const prevPostIds = prevPostsResult.map((p) => p.id);
    if (prevPostIds.length > 0) {
      const prevCheckpoints = await db
        .select({
          postId: topicPerformance.postId,
          engagementScore: topicPerformance.engagementScore,
          measuredAt: topicPerformance.measuredAt,
        })
        .from(topicPerformance)
        .where(inArray(topicPerformance.postId, prevPostIds))
        .orderBy(desc(topicPerformance.measuredAt));

      // Get latest score per post for previous period
      const prevSeenPosts = new Set<string>();
      let prevTotalScore = 0;
      let prevCount = 0;
      for (const cp of prevCheckpoints) {
        if (!prevSeenPosts.has(cp.postId)) {
          prevSeenPosts.add(cp.postId);
          if (cp.engagementScore !== null) {
            prevTotalScore += parseFloat(cp.engagementScore);
            prevCount++;
          }
        }
      }

      if (prevCount > 0) {
        const prevAvg = prevTotalScore / prevCount;
        if (prevAvg > 0) {
          trendPercent = Math.round(((avgPerPost - prevAvg) / prevAvg) * 1000) / 10;
        }
      }
    }
  }

  // bestPlatform
  let bestPlatform: string | null = null;
  if (platform === 'all') {
    const platformScores: Record<string, { total: number; count: number }> = {};
    for (const post of builtPosts) {
      if (!platformScores[post.platform]) {
        platformScores[post.platform] = { total: 0, count: 0 };
      }
      platformScores[post.platform].total += post.latestScore;
      platformScores[post.platform].count += 1;
    }

    let bestAvg = -Infinity;
    for (const [plt, data] of Object.entries(platformScores)) {
      const avg = data.count > 0 ? data.total / data.count : 0;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestPlatform = plt;
      }
    }
  } else {
    bestPlatform = builtPosts.length > 0 ? platform : null;
  }

  // bestPillar
  let bestPillar: string | null = null;
  const pillarScores: Record<string, { total: number; count: number }> = {};
  for (const post of postsResult) {
    const pillar = extractPillar(post.subAgentOutputs);
    if (!pillar) continue;
    const checkpoints = checkpointsByPost.get(post.id);
    if (!checkpoints || checkpoints.length === 0) continue;
    const latestScore = checkpoints[0].engagementScore !== null
      ? parseFloat(checkpoints[0].engagementScore)
      : 0;
    if (!pillarScores[pillar]) pillarScores[pillar] = { total: 0, count: 0 };
    pillarScores[pillar].total += latestScore;
    pillarScores[pillar].count += 1;
  }
  let bestPillarAvg = -Infinity;
  for (const [pillar, data] of Object.entries(pillarScores)) {
    const avg = data.count > 0 ? data.total / data.count : 0;
    if (avg > bestPillarAvg) {
      bestPillarAvg = avg;
      bestPillar = pillar;
    }
  }

  // ── 5. Timeline ────────────────────────────────────────────────────────────
  const timelineMap = new Map<string, { linkedin: number; x: number }>();
  for (const post of builtPosts) {
    if (!post.publishedAt) continue;
    const dateStr = post.publishedAt.slice(0, 10);
    if (!timelineMap.has(dateStr)) {
      timelineMap.set(dateStr, { linkedin: 0, x: 0 });
    }
    const entry = timelineMap.get(dateStr)!;
    if (post.platform === 'linkedin') {
      entry.linkedin += post.latestScore;
    } else if (post.platform === 'x') {
      entry.x += post.latestScore;
    }
  }

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      linkedin: Math.round(scores.linkedin * 1000) / 1000,
      x: Math.round(scores.x * 1000) / 1000,
    }));

  // ── 6. Response ────────────────────────────────────────────────────────────
  return NextResponse.json({
    summary: {
      totalEngagement: Math.round(totalEngagement * 1000) / 1000,
      avgPerPost: Math.round(avgPerPost * 1000) / 1000,
      totalPosts,
      trendPercent,
      bestPlatform,
      bestPillar,
    },
    timeline,
    posts: builtPosts,
  });
}
