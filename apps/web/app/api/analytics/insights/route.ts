import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts, topicPerformance, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and, desc, inArray } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insight {
  type: 'best_time' | 'best_pillar' | 'platform_comparison' | 'controversy' | 'consensus';
  title: string;
  description: string;
  magnitude: number;
  data: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function formatHourRange(hour: number): string {
  const next = (hour + 1) % 24;
  return `${formatHour(hour)}–${formatHour(next)}`;
}

function extractPillar(subAgentOutputs: unknown): string | null {
  if (!subAgentOutputs || typeof subAgentOutputs !== 'object') return null;
  const outputs = subAgentOutputs as Record<string, unknown>;
  const pillarBalancer = outputs['pillar_balancer'];
  if (!pillarBalancer || typeof pillarBalancer !== 'object') return null;
  const pb = pillarBalancer as Record<string, unknown>;
  return typeof pb['pillar'] === 'string' ? pb['pillar'] : null;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── GET /api/analytics/insights ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 1. Fetch all published posts with topic data ───────────────────────────
  const postsResult = await db
    .select({
      id: posts.id,
      platform: posts.platform,
      publishedAt: posts.publishedAt,
      topicId: posts.topicId,
      consensusTier: rawTopics.consensusTier,
      controversyLevel: rawTopics.controversyLevel,
      subAgentOutputs: scoredTopics.subAgentOutputs,
    })
    .from(posts)
    .leftJoin(scoredTopics, eq(posts.topicId, scoredTopics.id))
    .leftJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(and(eq(posts.userId, user.id), eq(posts.status, 'published')))
    .orderBy(desc(posts.publishedAt));

  const postIds = postsResult.map((p) => p.id);

  if (postIds.length === 0) {
    return NextResponse.json({ insights: [] });
  }

  // ── 2. Fetch 48h checkpoints ───────────────────────────────────────────────
  const checkpointRows = await db
    .select({
      postId: topicPerformance.postId,
      checkpoint: topicPerformance.checkpoint,
      engagementScore: topicPerformance.engagementScore,
    })
    .from(topicPerformance)
    .where(
      and(
        inArray(topicPerformance.postId, postIds),
        eq(topicPerformance.checkpoint, '48h'),
      ),
    );

  // Map: postId → 48h engagementScore
  const scoreByPost = new Map<string, number>();
  for (const row of checkpointRows) {
    if (row.engagementScore !== null) {
      scoreByPost.set(row.postId, parseFloat(row.engagementScore));
    }
  }

  // ── 3. Minimum data check: 10 published posts with 48h data ───────────────
  const qualifiedPosts = postsResult.filter((p) => scoreByPost.has(p.id));
  if (qualifiedPosts.length < 10) {
    return NextResponse.json({ insights: [] });
  }

  // Overall average engagement across qualified posts
  const allScores = qualifiedPosts.map((p) => scoreByPost.get(p.id)!);
  const overallAvg = avg(allScores);

  const insights: Insight[] = [];

  // ── Insight 1: best_time ──────────────────────────────────────────────────
  {
    // Group by (dayOfWeek, hour)
    const groups = new Map<string, number[]>();
    for (const post of qualifiedPosts) {
      if (!post.publishedAt) continue;
      const d = new Date(post.publishedAt);
      const dow = d.getUTCDay();
      const hour = d.getUTCHours();
      const key = `${dow}:${hour}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(scoreByPost.get(post.id)!);
    }

    let bestKey: string | null = null;
    let bestAvgScore = -Infinity;
    for (const [key, scores] of groups) {
      if (scores.length < 2) continue;
      const groupAvg = avg(scores);
      if (groupAvg > bestAvgScore) {
        bestAvgScore = groupAvg;
        bestKey = key;
      }
    }

    if (bestKey !== null && overallAvg > 0) {
      const [dowStr, hourStr] = bestKey.split(':');
      const dow = parseInt(dowStr, 10);
      const hour = parseInt(hourStr, 10);
      const pctAbove = roundPct(((bestAvgScore - overallAvg) / overallAvg) * 100);
      const group = groups.get(bestKey)!;

      if (pctAbove >= 5) {
        insights.push({
          type: 'best_time',
          title: `Best posting time: ${DAY_NAMES[dow]} ${formatHourRange(hour)}`,
          description: `Posts published at this time get ${pctAbove}% more engagement than your average`,
          magnitude: pctAbove,
          data: {
            dayOfWeek: dow,
            dayName: DAY_NAMES[dow],
            hour,
            hourRange: formatHourRange(hour),
            avgEngagement: Math.round(bestAvgScore * 1000) / 1000,
            overallAvg: Math.round(overallAvg * 1000) / 1000,
            postCount: group.length,
          },
        });
      }
    }
  }

  // ── Insight 2: platform_comparison ────────────────────────────────────────
  {
    const platformGroups: Record<string, number[]> = {};
    for (const post of qualifiedPosts) {
      if (!platformGroups[post.platform]) platformGroups[post.platform] = [];
      platformGroups[post.platform].push(scoreByPost.get(post.id)!);
    }

    const linkedin = platformGroups['linkedin'] ?? [];
    const x = platformGroups['x'] ?? [];

    if (linkedin.length >= 3 && x.length >= 3) {
      const linkedinAvg = avg(linkedin);
      const xAvg = avg(x);
      const better = linkedinAvg >= xAvg ? 'linkedin' : 'x';
      const betterAvg = better === 'linkedin' ? linkedinAvg : xAvg;
      const worseAvg = better === 'linkedin' ? xAvg : linkedinAvg;
      const betterLabel = better === 'linkedin' ? 'LinkedIn' : 'X';
      const worseLabel = better === 'linkedin' ? 'X' : 'LinkedIn';

      if (worseAvg > 0) {
        const pctDiff = roundPct(((betterAvg - worseAvg) / worseAvg) * 100);
        if (pctDiff >= 5) {
          insights.push({
            type: 'platform_comparison',
            title: `${betterLabel} outperforms ${worseLabel} by ${pctDiff}%`,
            description: `Your LinkedIn content averages ${Math.round(linkedinAvg * 1000) / 1000} vs X at ${Math.round(xAvg * 1000) / 1000}`,
            magnitude: pctDiff,
            data: {
              betterPlatform: better,
              linkedinAvg: Math.round(linkedinAvg * 1000) / 1000,
              xAvg: Math.round(xAvg * 1000) / 1000,
              linkedinPostCount: linkedin.length,
              xPostCount: x.length,
            },
          });
        }
      }
    }
  }

  // ── Insight 3: best_pillar ────────────────────────────────────────────────
  {
    const pillarGroups: Record<string, number[]> = {};
    for (const post of qualifiedPosts) {
      const pillar = extractPillar(post.subAgentOutputs);
      if (!pillar) continue;
      if (!pillarGroups[pillar]) pillarGroups[pillar] = [];
      pillarGroups[pillar].push(scoreByPost.get(post.id)!);
    }

    const pillarEntries = Object.entries(pillarGroups).filter(([, scores]) => scores.length >= 2);

    if (pillarEntries.length >= 2 && overallAvg > 0) {
      let bestPillar: string | null = null;
      let bestPillarAvg = -Infinity;
      for (const [pillar, scores] of pillarEntries) {
        const pillarAvg = avg(scores);
        if (pillarAvg > bestPillarAvg) {
          bestPillarAvg = pillarAvg;
          bestPillar = pillar;
        }
      }

      if (bestPillar !== null) {
        const multiplier = overallAvg > 0 ? Math.round((bestPillarAvg / overallAvg) * 10) / 10 : 0;
        const magnitude = multiplier * 10;

        if (magnitude >= 5) {
          insights.push({
            type: 'best_pillar',
            title: `Top pillar: ${bestPillar} content`,
            description: `${bestPillar} posts get ${multiplier}x average engagement`,
            magnitude,
            data: {
              pillar: bestPillar,
              avgEngagement: Math.round(bestPillarAvg * 1000) / 1000,
              overallAvg: Math.round(overallAvg * 1000) / 1000,
              multiplier,
              postCount: pillarGroups[bestPillar].length,
              pillarBreakdown: Object.fromEntries(
                pillarEntries.map(([p, scores]) => [p, {
                  avg: Math.round(avg(scores) * 1000) / 1000,
                  count: scores.length,
                }]),
              ),
            },
          });
        }
      }
    }
  }

  // ── Insight 4: controversy ────────────────────────────────────────────────
  {
    const controversyGroups: Record<number, number[]> = {};
    for (const post of qualifiedPosts) {
      const level = post.controversyLevel;
      if (level === null || level === undefined) continue;
      if (!controversyGroups[level]) controversyGroups[level] = [];
      controversyGroups[level].push(scoreByPost.get(post.id)!);
    }

    const levels = Object.keys(controversyGroups).map(Number).sort((a, b) => a - b);

    if (levels.length >= 2) {
      // Find sweet spot: highest avg engagement level
      let bestLevel: number | null = null;
      let bestLevelAvg = -Infinity;
      for (const level of levels) {
        const levelAvg = avg(controversyGroups[level]);
        if (levelAvg > bestLevelAvg) {
          bestLevelAvg = levelAvg;
          bestLevel = level;
        }
      }

      const level0Avg = controversyGroups[0] ? avg(controversyGroups[0]) : null;
      const baselineAvg = level0Avg !== null ? level0Avg : avg(controversyGroups[levels[0]]);

      if (bestLevel !== null && baselineAvg > 0) {
        const baselineLevel = level0Avg !== null ? 0 : levels[0];
        const pctAboveBaseline = roundPct(((bestLevelAvg - baselineAvg) / baselineAvg) * 100);

        if (pctAboveBaseline >= 5 && bestLevel !== baselineLevel) {
          insights.push({
            type: 'controversy',
            title: `Controversy level ${bestLevel} content performs best`,
            description: `Posts with controversy level ${bestLevel} get ${pctAboveBaseline}% more engagement than level ${baselineLevel}`,
            magnitude: pctAboveBaseline,
            data: {
              bestLevel,
              baselineLevel,
              bestLevelAvg: Math.round(bestLevelAvg * 1000) / 1000,
              baselineAvg: Math.round(baselineAvg * 1000) / 1000,
              breakdown: Object.fromEntries(
                levels.map((l) => [l, {
                  avg: Math.round(avg(controversyGroups[l]) * 1000) / 1000,
                  count: controversyGroups[l].length,
                }]),
              ),
            },
          });
        }
      }
    }
  }

  // ── Insight 5: consensus ──────────────────────────────────────────────────
  {
    const consensusGroups: Record<string, number[]> = {};
    for (const post of qualifiedPosts) {
      const tier = post.consensusTier;
      if (!tier) continue;
      if (!consensusGroups[tier]) consensusGroups[tier] = [];
      consensusGroups[tier].push(scoreByPost.get(post.id)!);
    }

    const tiers = Object.keys(consensusGroups);

    if (tiers.length >= 2) {
      // Find tier with lowest avg (baseline), compare best against it
      let bestTier: string | null = null;
      let bestTierAvg = -Infinity;
      let lowestTier: string | null = null;
      let lowestTierAvg = Infinity;

      for (const tier of tiers) {
        const tierAvg = avg(consensusGroups[tier]);
        if (tierAvg > bestTierAvg) {
          bestTierAvg = tierAvg;
          bestTier = tier;
        }
        if (tierAvg < lowestTierAvg) {
          lowestTierAvg = tierAvg;
          lowestTier = tier;
        }
      }

      // Prefer "experimental" as the baseline if present
      if (consensusGroups['experimental']) {
        lowestTier = 'experimental';
        lowestTierAvg = avg(consensusGroups['experimental']);
      }

      if (bestTier !== null && lowestTier !== null && bestTier !== lowestTier && lowestTierAvg > 0) {
        const pctAboveLowest = roundPct(((bestTierAvg - lowestTierAvg) / lowestTierAvg) * 100);

        if (pctAboveLowest >= 5) {
          insights.push({
            type: 'consensus',
            title: `${bestTier} consensus topics perform ${pctAboveLowest}% above average`,
            description: `Topics with '${bestTier}' consensus level drive ${pctAboveLowest}% more engagement than '${lowestTier}'`,
            magnitude: pctAboveLowest,
            data: {
              bestTier,
              lowestTier,
              bestTierAvg: Math.round(bestTierAvg * 1000) / 1000,
              lowestTierAvg: Math.round(lowestTierAvg * 1000) / 1000,
              breakdown: Object.fromEntries(
                tiers.map((t) => [t, {
                  avg: Math.round(avg(consensusGroups[t]) * 1000) / 1000,
                  count: consensusGroups[t].length,
                }]),
              ),
            },
          });
        }
      }
    }
  }

  // ── Sort by magnitude descending, return top 5 ────────────────────────────
  const sorted = insights.sort((a, b) => b.magnitude - a.magnitude).slice(0, 5);

  return NextResponse.json({ insights: sorted });
}
