'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { GlassCard } from '../../components/glass-card';
import { useState, useEffect, useCallback } from 'react';

// Stats are computed dynamically from topicStats state

const quickActions = [
  { label: 'Run Discovery', icon: 'search' },
  { label: 'Generate Content', icon: 'edit' },
  { label: 'View Analytics', icon: 'chart' },
];

const iconMap: Record<string, React.ReactNode> = {
  search: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  edit: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  ),
  chart: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  ),
  list: (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),
  arrow: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  ),
};

export default function DashboardPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get('welcome') === 'true';
  const [showWelcome, setShowWelcome] = useState(false);
  const [topicStats, setTopicStats] = useState({ pending: 0, approved: 0, total: 0 });
  const [contentStats, setContentStats] = useState({ review: 0, scheduled: 0 });
  const [queueStats, setQueueStats] = useState({ scheduledToday: 0, publishedThisWeek: 0, failedCount: 0, nextCaption: '' as string | null, nextPlatform: '' as string | null, nextTime: '' as string | null });

  useEffect(() => {
    if (isWelcome) setShowWelcome(true);
  }, [isWelcome]);

  const fetchTopicStats = useCallback(async () => {
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const res = await fetch('/api/topics?status=all&limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTopicStats((prev) => ({ ...prev, total: data.total }));
      }

      const pendingRes = await fetch('/api/topics?status=pending&limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setTopicStats((prev) => ({ ...prev, pending: data.total }));
      }

      const approvedRes = await fetch('/api/topics?status=approved&limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (approvedRes.ok) {
        const data = await approvedRes.json();
        setTopicStats((prev) => ({ ...prev, approved: data.total }));
      }

      // Fetch content stats
      const reviewRes = await fetch('/api/posts?status=review&limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reviewRes.ok) {
        const data = await reviewRes.json();
        setContentStats((prev) => ({ ...prev, review: data.total }));
      }

      const scheduledRes = await fetch('/api/posts?status=scheduled&limit=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (scheduledRes.ok) {
        const data = await scheduledRes.json();
        setContentStats((prev) => ({ ...prev, scheduled: data.total }));
      }

      // Fetch queue stats
      const queueRes = await fetch('/api/queue/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueueStats({
          scheduledToday: data.scheduledToday,
          publishedThisWeek: data.publishedThisWeek,
          failedCount: data.failedCount,
          nextCaption: data.nextScheduled?.captionPreview || null,
          nextPlatform: data.nextScheduled?.platform || null,
          nextTime: data.nextScheduled?.scheduledAt || null,
        });
      }
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => {
    fetchTopicStats();
  }, [fetchTopicStats]);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'there';

  return (
    <div className="p-6 lg:p-8">
      {/* Welcome toast */}
      {showWelcome && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-tertiary/20 bg-tertiary/10 px-5 py-3">
          <p className="text-sm text-tertiary">
            You&apos;re all set! Your first batch of topics will appear here shortly.
          </p>
          <button
            onClick={() => setShowWelcome(false)}
            className="ml-4 text-tertiary/60 hover:text-tertiary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white lg:text-3xl">
            Welcome, {displayName}!
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Your AI-powered social media command center
          </p>
        </div>
        <Link
          href="/dashboard/topics"
          className="glass hidden items-center gap-2 rounded-full px-4 py-2 transition-colors hover:border-accent/20 sm:flex"
        >
          <span className="h-2 w-2 rounded-full bg-accent/60" />
          <span className="text-[13px] font-medium text-text-muted">
            {topicStats.pending > 0
              ? `${topicStats.pending} topics to review`
              : 'Topic Review'}
          </span>
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        {[
          { label: 'Topics Scored', value: topicStats.total || '\u2014' },
          { label: 'Pending Review', value: topicStats.pending || '\u2014' },
          { label: 'Approved', value: topicStats.approved || '\u2014' },
          { label: 'Content Ready', value: contentStats.review || '\u2014' },
        ].map((stat) => (
          <GlassCard key={stat.label} className="border-t-2 border-t-accent/60 p-5 lg:p-6">
            <p className="text-2xl font-bold text-white lg:text-3xl">{stat.value}</p>
            <p className="mt-1 text-[13px] text-text-muted">{stat.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Content area */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Empty state — Topics */}
        <GlassCard className="flex flex-col items-center justify-center p-10 lg:col-span-3 lg:p-12">
          <div className="text-text-muted/30">{iconMap.list}</div>
          <p className="mt-4 text-base text-text-muted">No topics yet</p>
          <p className="mt-1 text-center text-[13px] text-text-muted/60">
            {isWelcome
              ? 'Your AI is discovering topics right now...'
              : 'Topics will appear here once discovery runs'}
          </p>
        </GlassCard>

        {/* Quick Actions */}
        <GlassCard className="p-6 lg:col-span-2">
          <h3 className="mb-5 text-sm font-semibold uppercase tracking-widest text-text-muted">
            Quick Actions
          </h3>
          <div className="space-y-3">
            {quickActions.map((action) => (
              <div
                key={action.label}
                className="glass flex items-center justify-between rounded-xl p-4 opacity-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-accent">{iconMap[action.icon]}</span>
                  <span className="text-sm text-white">{action.label}</span>
                </div>
                <span className="text-text-muted/40">{iconMap.arrow}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Section links */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/topics">
          <GlassCard hover className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-semibold text-white">Topic Review</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {topicStats.pending > 0
                  ? `${topicStats.pending} topics pending review`
                  : 'Review and approve scored topics'}
              </p>
            </div>
            <span className="text-text-muted/40">{iconMap.arrow}</span>
          </GlassCard>
        </Link>
        <Link href="/dashboard/content">
          <GlassCard hover className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-semibold text-white">Content Studio</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {contentStats.review > 0
                  ? `${contentStats.review} posts ready for review`
                  : contentStats.scheduled > 0
                    ? `${contentStats.scheduled} posts scheduled`
                    : 'Review and edit generated content'}
              </p>
            </div>
            <span className="text-text-muted/40">{iconMap.arrow}</span>
          </GlassCard>
        </Link>
        <Link href="/dashboard/queue">
          <GlassCard hover className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-semibold text-white">Publishing Queue</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {queueStats.failedCount > 0
                  ? <span className="text-red-400">{queueStats.failedCount} failed</span>
                  : queueStats.scheduledToday > 0
                    ? `${queueStats.scheduledToday} scheduled today`
                    : `${queueStats.publishedThisWeek} published this week`}
              </p>
            </div>
            <span className="text-text-muted/40">{iconMap.arrow}</span>
          </GlassCard>
        </Link>
        <GlassCard className="flex items-center justify-center p-6 opacity-40">
          <p className="text-sm text-text-muted">Analytics (Phase 9)</p>
        </GlassCard>
      </div>
    </div>
  );
}
