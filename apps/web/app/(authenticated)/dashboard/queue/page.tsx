'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '../../../components/glass-card';
import { formatDistanceToNow, format } from 'date-fns';

type QueueTab = 'upcoming' | 'publishing' | 'published' | 'failed';

interface QueuePost {
  id: string;
  platform: string;
  caption: string;
  imageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  topicTitle: string | null;
  finalScore: string | null;
}

interface QueueStats {
  scheduledToday: number;
  scheduledThisWeek: number;
  publishedThisWeek: number;
  failedCount: number;
  nextScheduled: {
    postId: string;
    platform: string;
    scheduledAt: string;
    captionPreview: string;
  } | null;
}

async function getToken(): Promise<string | undefined> {
  const { getAuth, onAuthStateChanged } = await import('firebase/auth');
  const auth = getAuth();
  // If currentUser is already available (warm load), use it immediately
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  // Otherwise wait for Firebase to finish initialising auth state (cold load / refresh)
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ? user.getIdToken() : undefined);
    });
  });
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: 'bg-yellow-500/15 text-yellow-400',
    publishing: 'bg-blue-500/15 text-blue-400',
    published: 'bg-green-500/15 text-green-400',
    failed: 'bg-red-500/15 text-red-400',
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${styles[status] || 'bg-white/10 text-text-muted'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function TimeDisplay({ date, prefix }: { date: string; prefix?: string }) {
  const d = new Date(date);
  const formatted = format(d, 'EEE, MMM d \'at\' h:mm a');
  const relative = formatDistanceToNow(d, { addSuffix: true });
  return (
    <p className="text-xs text-text-muted">
      {prefix && <span className="text-text-muted/60">{prefix} </span>}
      {formatted}
      <span className="ml-1.5 text-text-muted/50">({relative})</span>
    </p>
  );
}

export default function QueuePage() {
  const [tab, setTab] = useState<QueueTab>('upcoming');
  const [posts, setPosts] = useState<QueuePost[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reschedulePostId, setReschedulePostId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const fetchData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    setLoading(true);
    try {
      const statusMap: Record<QueueTab, string> = {
        upcoming: 'upcoming',
        publishing: 'publishing',
        published: 'published',
        failed: 'failed',
      };

      const [postsRes, statsRes] = await Promise.all([
        fetch(`/api/queue?status=${statusMap[tab]}&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/queue/stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch {
      // Non-critical fetch failure
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh publishing tab
  useEffect(() => {
    if (tab !== 'publishing') return;
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [tab, fetchData]);

  async function handleAction(postId: string, action: string, body?: object) {
    const token = await getToken();
    if (!token) return;

    setActionLoading(postId);
    try {
      const res = await fetch(`/api/posts/${postId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(null);
      setReschedulePostId(null);
      setRescheduleDate('');
    }
  }

  const tabs: { key: QueueTab; label: string; count?: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: stats?.scheduledThisWeek },
    { key: 'publishing', label: 'Publishing' },
    { key: 'published', label: 'Published', count: stats?.publishedThisWeek },
    { key: 'failed', label: 'Failed', count: stats?.failedCount },
  ];

  function getExternalUrl(post: QueuePost) {
    if (!post.externalId) return null;
    if (post.platform === 'linkedin') {
      return `https://www.linkedin.com/feed/update/${post.externalId}`;
    }
    return `https://x.com/i/web/status/${post.externalId}`;
  }

  const emptyMessages: Record<QueueTab, { title: string; desc: string }> = {
    upcoming: {
      title: 'No posts scheduled',
      desc: 'Generate content and schedule it from the Content Studio.',
    },
    publishing: {
      title: 'Nothing publishing right now',
      desc: 'Scheduled posts will appear here when they start publishing.',
    },
    published: {
      title: 'No posts published yet',
      desc: 'Your first post is just a few clicks away!',
    },
    failed: {
      title: 'No failures',
      desc: 'Everything is running smoothly.',
    },
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white lg:text-3xl">Publishing Queue</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage scheduled posts and track publishing status
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
            <p className="text-2xl font-bold text-white lg:text-3xl">
              {stats.scheduledToday ?? '\u2014'}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">Scheduled Today</p>
          </GlassCard>
          <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
            <p className="text-2xl font-bold text-white lg:text-3xl">
              {stats.scheduledThisWeek ?? '\u2014'}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">Scheduled This Week</p>
          </GlassCard>
          <GlassCard className="border-t-2 border-t-accent/60 p-5 lg:p-6">
            <p className="text-2xl font-bold text-white lg:text-3xl">
              {stats.publishedThisWeek ?? '\u2014'}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">Published This Week</p>
          </GlassCard>
          <GlassCard className={`border-t-2 p-5 lg:p-6 ${stats.failedCount > 0 ? 'border-t-red-500/60' : 'border-t-accent/60'}`}>
            <p className={`text-2xl font-bold lg:text-3xl ${stats.failedCount > 0 ? 'text-red-400' : 'text-white'}`}>
              {stats.failedCount ?? '\u2014'}
            </p>
            <p className="mt-1 text-[13px] text-text-muted">Failed</p>
          </GlassCard>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? 'bg-accent/20 font-medium text-accent'
                : 'text-text-muted hover:text-white'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-medium ${
                  t.key === 'failed'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-white/10 text-text-muted'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <GlassCard className="flex flex-col items-center justify-center p-10 lg:p-16">
          <p className="text-base text-text-muted">{emptyMessages[tab].title}</p>
          <p className="mt-1 text-center text-[13px] text-text-muted/60">
            {emptyMessages[tab].desc}
          </p>
        </GlassCard>
      )}

      {/* Post list */}
      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((post) => (
            <GlassCard key={post.id} className="p-5">
              <div className="flex items-start gap-4">
                {/* Image thumbnail */}
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
                  />
                )}

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={post.platform} />
                    <StatusBadge status={post.status} />
                    {post.finalScore && (
                      <span className="text-[11px] text-text-muted/60">
                        Score: {parseFloat(post.finalScore).toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-sm text-white">
                    {post.caption.substring(0, 150)}
                    {post.caption.length > 150 ? '...' : ''}
                  </p>

                  {post.topicTitle && (
                    <p className="mt-1 text-xs text-text-muted/60">
                      Topic: {post.topicTitle}
                    </p>
                  )}

                  {/* Time info */}
                  <div className="mt-2">
                    {post.scheduledAt && tab === 'upcoming' && (
                      <TimeDisplay date={post.scheduledAt} prefix="Scheduled:" />
                    )}
                    {post.publishedAt && tab === 'published' && (
                      <TimeDisplay date={post.publishedAt} prefix="Published:" />
                    )}
                    {tab === 'publishing' && (
                      <p className="flex items-center gap-1.5 text-xs text-blue-400">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                        Publishing to {post.platform === 'linkedin' ? 'LinkedIn' : 'X'}...
                      </p>
                    )}
                    {tab === 'failed' && post.updatedAt && (
                      <TimeDisplay date={post.updatedAt} prefix="Last attempt:" />
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-2">
                  {/* Upcoming actions */}
                  {tab === 'upcoming' && (
                    <>
                      <button
                        onClick={() => {
                          setReschedulePostId(
                            reschedulePostId === post.id ? null : post.id,
                          );
                        }}
                        className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white"
                      >
                        Reschedule
                      </button>
                      <button
                        disabled={actionLoading === post.id}
                        onClick={() => {
                          if (confirm('Publish this post now?')) {
                            handleAction(post.id, 'publish-now');
                          }
                        }}
                        className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
                      >
                        Publish Now
                      </button>
                      <button
                        disabled={actionLoading === post.id}
                        onClick={() => {
                          if (confirm('Cancel this scheduled post?')) {
                            handleAction(post.id, 'cancel');
                          }
                        }}
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* Published action */}
                  {tab === 'published' && post.externalId && (
                    <a
                      href={getExternalUrl(post) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white"
                    >
                      View on {post.platform === 'linkedin' ? 'LinkedIn' : 'X'} &rarr;
                    </a>
                  )}

                  {/* Failed actions */}
                  {tab === 'failed' && (
                    <>
                      <button
                        disabled={actionLoading === post.id}
                        onClick={() => handleAction(post.id, 'retry')}
                        className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
                      >
                        Retry
                      </button>
                      <button
                        disabled={actionLoading === post.id}
                        onClick={() => {
                          if (confirm('Permanently delete this post?')) {
                            handleAction(post.id, '', undefined);
                            // Use DELETE on the post endpoint
                            (async () => {
                              const token = await getToken();
                              if (!token) return;
                              await fetch(`/api/posts/${post.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              fetchData();
                            })();
                          }
                        }}
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Reschedule picker */}
              {reschedulePostId === post.id && (
                <div className="mt-3 flex items-center gap-3 border-t border-white/5 pt-3">
                  <input
                    type="datetime-local"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-accent/40"
                  />
                  <button
                    disabled={!rescheduleDate || actionLoading === post.id}
                    onClick={() =>
                      handleAction(post.id, 'reschedule', {
                        scheduledAt: new Date(rescheduleDate).toISOString(),
                      })
                    }
                    className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setReschedulePostId(null);
                      setRescheduleDate('');
                    }}
                    className="text-xs text-text-muted hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
