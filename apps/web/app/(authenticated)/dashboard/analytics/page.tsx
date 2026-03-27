'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { GlassCard } from '../../../components/glass-card';
import { EngagementChart } from '../../../components/analytics/EngagementChart';
import { CheckpointChart } from '../../../components/analytics/CheckpointChart';

// ─── Types ────────────────────────────────────────────────────────────────────

type DateRange = '7d' | '30d' | '90d' | 'all';

interface CheckpointEntry {
  checkpoint: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  score: number;
}

interface AnalyticsPost {
  id: string;
  platform: string;
  caption: string;
  publishedAt: string | null;
  externalUrl: string;
  topicTitle: string | null;
  latestScore: number;
  trend: 'up' | 'down' | 'flat';
  checkpoints: CheckpointEntry[];
}

interface TimelineEntry {
  date: string;
  linkedin: number;
  x: number;
}

interface AnalyticsSummary {
  totalEngagement: number;
  avgPerPost: number;
  totalPosts: number;
  trendPercent: number;
  bestPlatform: string | null;
  bestPillar: string | null;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  timeline: TimelineEntry[];
  posts: AnalyticsPost[];
}

interface Insight {
  type: 'best_time' | 'best_pillar' | 'platform_comparison' | 'controversy' | 'consensus';
  title: string;
  description: string;
  magnitude: number;
  data: Record<string, unknown>;
}

// ─── Learning Progress Types ─────────────────────────────────────────────────

interface LearningData {
  maturity: {
    totalPosts: number;
    stage: 'collecting' | 'adjusting' | 'learning' | 'optimized';
    postsUntilNextStage: number;
  };
  weights: {
    current: Record<string, number>;
    defaults: Record<string, number>;
    lastUpdated: string | null;
  };
  patterns: {
    top_hooks: { type: string; example: string; avg_engagement: number }[];
    top_ctas: { text: string; avg_engagement: number }[];
    optimal_length: { platform: string; min: number; max: number; best: number }[];
    hashtag_performance: { count: number; avg_engagement: number }[];
  } | null;
  optimalTimes: {
    best_hours: { hour: number; day_of_week: number; avg_engagement: number; sample_size: number }[];
    best_days: { day_of_week: number; avg_engagement: number; day_name: string }[];
    worst_hours: { hour: number; day_of_week: number; avg_engagement: number }[];
    recommendations: string[];
  } | null;
  feedbackHistory: {
    records: { postId: string; predicted: number; actual: number; delta: number; date: string }[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  return auth.currentUser?.getIdToken();
}

function TrendArrow({ trendPercent }: { trendPercent: number }) {
  if (trendPercent > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-green-400">
        ↑ {trendPercent}%
      </span>
    );
  }
  if (trendPercent < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm font-medium text-red-400">
        ↓ {Math.abs(trendPercent)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-sm font-medium text-text-muted">
      →
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const isLinkedIn = platform === 'linkedin';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
        isLinkedIn
          ? 'bg-blue-500/15 text-blue-400'
          : 'bg-white/10 text-white'
      }`}
    >
      {isLinkedIn ? 'LinkedIn' : 'X'}
    </span>
  );
}

function InsightTypeBadge({ type }: { type: Insight['type'] }) {
  const styles: Record<Insight['type'], string> = {
    best_time: 'bg-purple-500/15 text-purple-400',
    best_pillar: 'bg-blue-500/15 text-blue-400',
    platform_comparison: 'bg-green-500/15 text-green-400',
    controversy: 'bg-orange-500/15 text-orange-400',
    consensus: 'bg-teal-500/15 text-teal-400',
  };
  const labels: Record<Insight['type'], string> = {
    best_time: 'Timing',
    best_pillar: 'Pillar',
    platform_comparison: 'Platform',
    controversy: 'Controversy',
    consensus: 'Consensus',
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function PostTrendIcon({ trend }: { trend: AnalyticsPost['trend'] }) {
  if (trend === 'up') return <span className="text-sm text-green-400">↑</span>;
  if (trend === 'down') return <span className="text-sm text-red-400">↓</span>;
  return <span className="text-sm text-text-muted">→</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [learningData, setLearningData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (range: DateRange) => {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch {
      // Non-critical fetch failure
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/analytics/insights', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
      }
    } catch {
      // Non-critical fetch failure
    }
  }, []);

  const fetchLearning = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    try {
      const res = await fetch('/api/analytics/learning', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLearningData(data);
      }
    } catch {
      // Non-critical fetch failure
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(dateRange);
  }, [dateRange, fetchAnalytics]);

  useEffect(() => {
    fetchInsights();
    fetchLearning();
  }, [fetchInsights, fetchLearning]);

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: 'all', label: 'All time' },
  ];

  const summary = analyticsData?.summary;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white lg:text-3xl">Analytics</h1>
          <p className="mt-1 text-sm text-text-muted">
            Track how your content performs across platforms
          </p>
        </div>

        {/* Date range pills */}
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {dateRangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                dateRange === opt.value
                  ? 'bg-accent/20 font-medium text-accent'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        {/* Card 1: Total Engagement */}
        <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
          <p className="text-2xl font-bold text-white lg:text-3xl">
            {summary ? summary.totalEngagement.toFixed(1) : '—'}
          </p>
          {summary && (
            <div className="mt-1">
              <TrendArrow trendPercent={summary.trendPercent} />
            </div>
          )}
          <p className="mt-1 text-[13px] text-text-muted">Total Engagement</p>
        </GlassCard>

        {/* Card 2: Avg Per Post */}
        <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
          <p className="text-2xl font-bold text-white lg:text-3xl">
            {summary ? summary.avgPerPost.toFixed(1) : '—'}
          </p>
          <p className="mt-1 text-[13px] text-text-muted">Avg Per Post</p>
          {summary && summary.totalPosts > 0 && (
            <p className="mt-0.5 text-[11px] text-text-muted/60">
              across {summary.totalPosts} published posts
            </p>
          )}
        </GlassCard>

        {/* Card 3: Best Platform */}
        <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
          {summary?.bestPlatform ? (
            <>
              <p className="text-2xl font-bold text-white lg:text-3xl">
                {summary.bestPlatform === 'linkedin' ? 'LinkedIn' : 'X'}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-text-muted lg:text-3xl">—</p>
          )}
          <p className="mt-1 text-[13px] text-text-muted">Best Platform</p>
        </GlassCard>

        {/* Card 4: Best Pillar */}
        <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
          <p className="text-2xl font-bold text-white lg:text-3xl">
            {summary?.bestPillar ?? (loading ? '...' : '—')}
          </p>
          <p className="mt-1 text-[13px] text-text-muted">Best Content Pillar</p>
        </GlassCard>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {!loading && analyticsData && (
        <>
          {/* Engagement Over Time */}
          <GlassCard className="mb-8 p-5 lg:p-6">
            <h2 className="mb-4 text-base font-semibold text-white">Engagement Over Time</h2>
            <EngagementChart data={analyticsData.timeline} dateRange={dateRange} />
          </GlassCard>

          {/* Post Performance Table or Empty State */}
          {analyticsData.posts.length === 0 ? (
            <GlassCard className="mb-8 flex flex-col items-center justify-center p-10 lg:p-16">
              <p className="text-base text-white">No analytics yet</p>
              <p className="mt-2 max-w-sm text-center text-[13px] text-text-muted/70">
                Publish your first post and check back in 2 hours for initial metrics.
              </p>
              <Link
                href="/dashboard/content"
                className="mt-5 rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/30"
              >
                Go to Content Studio
              </Link>
            </GlassCard>
          ) : (
            <GlassCard className="mb-8 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 lg:px-6">
                <h2 className="text-base font-semibold text-white">Post Performance</h2>
                <span className="text-[13px] text-text-muted">
                  {analyticsData.posts.length} post{analyticsData.posts.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Scrollable table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted/60 lg:px-6">
                        Published
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Platform
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Caption
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Impr.
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Likes
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Comments
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Shares
                      </th>
                      <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                        Score
                      </th>
                      <th className="px-3 py-3 text-center text-[11px] font-medium uppercase tracking-wide text-text-muted/60 lg:pr-6">
                        Trend
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {analyticsData.posts.map((post) => {
                      const isExpanded = expandedPostId === post.id;
                      const latest = post.checkpoints[0];
                      return (
                        <React.Fragment key={post.id}>
                          <tr
                            onClick={() =>
                              setExpandedPostId(isExpanded ? null : post.id)
                            }
                            className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                          >
                            <td className="px-5 py-3 text-xs text-text-muted lg:px-6">
                              {post.publishedAt
                                ? new Date(post.publishedAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <PlatformBadge platform={post.platform} />
                            </td>
                            <td className="max-w-[200px] px-3 py-3">
                              <p className="truncate text-xs text-white">
                                {post.caption.length > 60
                                  ? post.caption.slice(0, 60) + '…'
                                  : post.caption}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right text-xs text-text-muted">
                              {latest?.impressions ?? '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-xs text-text-muted">
                              {latest?.likes ?? '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-xs text-text-muted">
                              {latest?.comments ?? '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-xs text-text-muted">
                              {latest?.shares ?? '—'}
                            </td>
                            <td className="px-3 py-3 text-right text-xs font-medium text-white">
                              {post.latestScore.toFixed(1)}
                            </td>
                            <td className="px-3 py-3 text-center lg:pr-6">
                              <PostTrendIcon trend={post.trend} />
                            </td>
                          </tr>

                          {/* Expanded row */}
                          {isExpanded && (
                            <tr key={`${post.id}-expanded`}>
                              <td colSpan={9} className="bg-white/[0.02] px-5 py-4 lg:px-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                                  <div>
                                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted/60">
                                      Engagement over time
                                    </p>
                                    <CheckpointChart
                                      id={post.id}
                                      checkpoints={post.checkpoints.map((cp) => ({
                                        checkpoint: cp.checkpoint,
                                        likes: cp.likes,
                                        comments: cp.comments,
                                        shares: cp.shares,
                                        impressions: cp.impressions,
                                      }))}
                                    />
                                  </div>
                                  {post.externalUrl && (
                                    <div className="flex items-start pt-2">
                                      <a
                                        href={post.externalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white"
                                      >
                                        View on{' '}
                                        {post.platform === 'linkedin' ? 'LinkedIn' : 'X'} &rarr;
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {/* Insights Section */}
          {insights !== null && (
            <GlassCard className="mb-8 p-5 lg:p-6">
              <h2 className="mb-4 text-base font-semibold text-white">Performance Insights</h2>
              {insights.length === 0 ? (
                <p className="text-sm text-text-muted/70">
                  Need at least 10 published posts for insights
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {insights.map((insight, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/5 bg-white/[0.03] p-4"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <InsightTypeBadge type={insight.type} />
                      </div>
                      <p className="text-sm font-medium text-white">{insight.title}</p>
                      <p className="mt-1 text-[13px] text-text-muted/80">{insight.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* Learning Progress Section */}
          {learningData && <LearningProgressSection data={learningData} />}
        </>
      )}

      {/* Show learning section even during loading if we have the data */}
      {loading && learningData && <LearningProgressSection data={learningData} />}
    </div>
  );
}

// ─── Learning Progress Section ───────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  sentiment: 'Sentiment',
  audience_fit: 'Audience Fit',
  seo: 'SEO',
  competitor_gap: 'Competitor Gap',
  content_market_fit: 'Content-Market Fit',
  engagement_pred: 'Engagement Pred',
};

const STAGE_CONFIG: Record<
  LearningData['maturity']['stage'],
  { label: string; color: string; progress: number }
> = {
  collecting: { label: 'Collecting baseline', color: 'bg-yellow-500', progress: 25 },
  adjusting: { label: 'Weights adjusting', color: 'bg-blue-500', progress: 50 },
  learning: { label: 'Pattern learning active', color: 'bg-purple-500', progress: 75 },
  optimized: { label: 'Fully optimized', color: 'bg-green-500', progress: 100 },
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function LearningProgressSection({ data }: { data: LearningData }) {
  const { maturity, weights, patterns, optimalTimes } = data;
  const stage = STAGE_CONFIG[maturity.stage];

  return (
    <GlassCard className="p-5 lg:p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-semibold text-white">How Your AI Is Learning</h2>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${stage.color}/20 text-white`}>
          {stage.label}
        </span>
      </div>
      <p className="mb-5 text-[13px] text-text-muted/70">
        The scoring model adapts based on your actual engagement data
      </p>

      {/* Maturity Progress Bar */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] text-text-muted">
            {maturity.totalPosts} post{maturity.totalPosts !== 1 ? 's' : ''} analyzed
            {weights.lastUpdated && (
              <> &middot; Weights last updated {formatRelativeTime(weights.lastUpdated)}</>
            )}
          </span>
          {maturity.postsUntilNextStage > 0 && (
            <span className="text-[12px] text-text-muted/60">
              {maturity.postsUntilNextStage} more until next stage
            </span>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className={`h-full rounded-full transition-all duration-700 ${stage.color}`}
            style={{ width: `${stage.progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-text-muted/40">
          <span>Collecting</span>
          <span>Adjusting</span>
          <span>Learning</span>
          <span>Optimized</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weight Visualization */}
        <div>
          <h3 className="mb-3 text-[13px] font-medium text-white">Scoring Weights</h3>
          <div className="space-y-2.5">
            {Object.entries(weights.current).map(([dim, value]) => {
              const defaultVal = weights.defaults[dim] ?? 0;
              const delta = value - defaultVal;
              const direction = delta > 0.002 ? 'up' : delta < -0.002 ? 'down' : 'flat';
              const barWidth = Math.max(5, (value / 0.4) * 100); // 0.40 is MAX_WEIGHT
              const ghostWidth = Math.max(5, (defaultVal / 0.4) * 100);

              return (
                <div key={dim}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] text-text-muted">
                      {DIMENSION_LABELS[dim] ?? dim}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px]">
                      <span className="font-mono text-white">{value.toFixed(3)}</span>
                      {direction === 'up' && (
                        <span className="text-green-400">↑</span>
                      )}
                      {direction === 'down' && (
                        <span className="text-red-400">↓</span>
                      )}
                      {direction !== 'flat' && (
                        <span className="text-[10px] text-text-muted/50">
                          was {defaultVal.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
                    {/* Ghost bar showing default weight */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full border border-white/10"
                      style={{ width: `${ghostWidth}%` }}
                    />
                    {/* Current weight bar */}
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                        direction === 'up'
                          ? 'bg-green-500/70'
                          : direction === 'down'
                            ? 'bg-white/20'
                            : 'bg-accent/50'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Learned Patterns + Optimal Times */}
        <div className="space-y-5">
          {/* Learned Patterns */}
          {patterns && (patterns.top_hooks.length > 0 || patterns.hashtag_performance.length > 0) && (
            <div>
              <h3 className="mb-3 text-[13px] font-medium text-white">Learned Patterns</h3>
              <div className="space-y-2">
                {patterns.top_hooks.slice(0, 3).map((hook, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-white capitalize">
                        {hook.type.replace('_', ' ')} hooks
                      </span>
                      <span className="text-[11px] text-green-400">
                        {hook.avg_engagement.toFixed(1)} avg
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted/60">
                      e.g. &ldquo;{hook.example}&rdquo;
                    </p>
                  </div>
                ))}
                {patterns.optimal_length.map((ol, i) => (
                  <div
                    key={`len-${i}`}
                    className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[12px] text-text-muted"
                  >
                    Optimal {ol.platform === 'linkedin' ? 'LinkedIn' : 'X'} length:{' '}
                    <span className="text-white">{ol.min}–{ol.max} words</span>{' '}
                    (best: {ol.best})
                  </div>
                ))}
                {patterns.hashtag_performance.length > 0 && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[12px] text-text-muted">
                    Best hashtag count:{' '}
                    <span className="text-white">{patterns.hashtag_performance[0].count}</span>{' '}
                    ({patterns.hashtag_performance[0].avg_engagement.toFixed(1)} avg engagement)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optimal Posting Schedule */}
          {optimalTimes && optimalTimes.best_hours.length > 0 && (
            <div>
              <h3 className="mb-3 text-[13px] font-medium text-white">Optimal Posting Schedule</h3>
              {/* Weekly heatmap */}
              <WeeklyHeatmap optimalTimes={optimalTimes} />
              {/* Recommendations */}
              {optimalTimes.recommendations.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {optimalTimes.recommendations.map((rec, i) => (
                    <p key={i} className="text-[12px] text-text-muted/70">
                      {rec}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state when no patterns yet */}
          {!patterns && !optimalTimes && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-8">
              <p className="text-[13px] text-text-muted/60">
                {maturity.totalPosts < 10
                  ? `Publish ${10 - maturity.totalPosts} more posts to start learning patterns`
                  : 'Patterns will appear after engagement data is collected'}
              </p>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Weekly Heatmap ──────────────────────────────────────────────────────────

function WeeklyHeatmap({
  optimalTimes,
}: {
  optimalTimes: NonNullable<LearningData['optimalTimes']>;
}) {
  // Build a lookup: `${dayOfWeek}-${hour}` → engagement score
  const heatData: Record<string, number> = {};
  let maxEng = 0;
  for (const slot of optimalTimes.best_hours) {
    const key = `${slot.day_of_week}-${slot.hour}`;
    heatData[key] = slot.avg_engagement;
    if (slot.avg_engagement > maxEng) maxEng = slot.avg_engagement;
  }
  for (const slot of optimalTimes.worst_hours) {
    const key = `${slot.day_of_week}-${slot.hour}`;
    if (!heatData[key]) {
      heatData[key] = slot.avg_engagement;
    }
  }

  // Show hours from 6AM to 10PM
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

  function getCellColor(day: number, hour: number): string {
    const key = `${day}-${hour}`;
    const val = heatData[key];
    if (val === undefined) return 'bg-white/[0.03]'; // no data
    if (maxEng === 0) return 'bg-white/[0.03]';
    const ratio = val / maxEng;
    if (ratio >= 0.75) return 'bg-green-500/50';
    if (ratio >= 0.5) return 'bg-green-500/25';
    if (ratio >= 0.25) return 'bg-yellow-500/20';
    return 'bg-red-500/15';
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px]">
        {/* Header row */}
        <div className="mb-1 flex">
          <div className="w-8 shrink-0" />
          {hours.map((h) => (
            <div
              key={h}
              className="flex-1 text-center text-[9px] text-text-muted/40"
            >
              {h % 3 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>
        {/* Day rows */}
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <div key={day} className="mb-0.5 flex items-center">
            <div className="w-8 shrink-0 text-[10px] text-text-muted/50">
              {DAY_NAMES_SHORT[day]}
            </div>
            <div className="flex flex-1 gap-px">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`h-3 flex-1 rounded-[2px] ${getCellColor(day, hour)}`}
                  title={`${DAY_NAMES_SHORT[day]} ${hour}:00 — ${heatData[`${day}-${hour}`]?.toFixed(1) ?? 'no data'}`}
                />
              ))}
            </div>
          </div>
        ))}
        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-2 text-[9px] text-text-muted/40">
          <span>Low</span>
          <div className="flex gap-px">
            <div className="h-2 w-4 rounded-[2px] bg-red-500/15" />
            <div className="h-2 w-4 rounded-[2px] bg-yellow-500/20" />
            <div className="h-2 w-4 rounded-[2px] bg-green-500/25" />
            <div className="h-2 w-4 rounded-[2px] bg-green-500/50" />
          </div>
          <span>High</span>
          <div className="ml-2 h-2 w-4 rounded-[2px] bg-white/[0.03]" />
          <span>No data</span>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
