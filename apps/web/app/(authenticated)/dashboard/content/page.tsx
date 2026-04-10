'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AddToSheetsButton } from '@/app/components/add-to-sheets-button';
import { GlassCard } from '@/app/components/glass-card';

type Post = {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[] | null;
  imagePrompt: string | null;
  imageUrl: string | null;
  imageUrls: Record<string, string> | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  topicId: string | null;
  topicTitle: string | null;
  topicAngle: string | null;
  finalScore: string | null;
  consensusMultiplier: string | null;
};

const STATUS_TABS = ['review', 'scheduled', 'generating', 'all'] as const;
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  x: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
};

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  generating: { label: 'Generating', classes: 'bg-accent/20 text-accent' },
  review: { label: 'Ready for Review', classes: 'bg-yellow-500/20 text-yellow-400' },
  scheduled: { label: 'Scheduled', classes: 'bg-blue-500/20 text-blue-400' },
  published: { label: 'Published', classes: 'bg-green-500/20 text-green-400' },
  draft: { label: 'Draft', classes: 'bg-white/10 text-text-muted' },
  failed: { label: 'Failed', classes: 'bg-red-500/20 text-red-400' },
};

interface OptimalSlot {
  hour: number;
  day_of_week: number;
  avg_engagement: number;
  sample_size: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDefaultSheetTimestamp(scheduledAt: string | null) {
  if (scheduledAt) {
    return scheduledAt;
  }

  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(9, 0, 0, 0);
  return nextDay.toISOString();
}

function PostImage({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src: string | null;
  alt: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={
          fallbackClassName ||
          `flex items-center justify-center bg-white/5 text-xs text-text-muted ${className}`
        }
      >
        Image unavailable
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailed(true)} />
  );
}

function PostCard({
  post,
  optimalSlots,
  getToken,
  onEditCaption,
  onRegenerateImage,
  onSchedule,
  onPublishNow,
  onDelete,
}: {
  post: Post;
  optimalSlots: OptimalSlot[];
  getToken: () => Promise<string>;
  onEditCaption: (id: string, caption: string) => void;
  onRegenerateImage: (id: string) => void;
  onSchedule: (id: string, scheduledAt: string) => void;
  onPublishNow: (post: Post) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const badge = STATUS_BADGES[post.status] || STATUS_BADGES.draft;
  const platform = post.platform;
  const wordCount = post.caption.split(/\s+/).length;
  const charCount = post.caption.length;
  const hashtagCount = (post.hashtags as string[] | null)?.length || 0;
  const score = post.finalScore ? parseFloat(post.finalScore).toFixed(2) : null;
  const sheetsTimestamp = getDefaultSheetTimestamp(post.scheduledAt);

  const handleSaveCaption = () => {
    onEditCaption(post.id, editCaption);
    setEditing(false);
  };

  const handleSchedule = () => {
    if (scheduleDate) {
      const dateTime = `${scheduleDate}T${scheduleTime}:00`;
      onSchedule(post.id, new Date(dateTime).toISOString());
      setShowSchedule(false);
    }
  };

  return (
    <GlassCard className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={platform === 'linkedin' ? 'text-[#0A66C2]' : 'text-white'}>
            {PLATFORM_ICONS[platform] || platform}
          </span>
          <span className="text-sm font-medium capitalize text-white">
            {platform === 'x' ? 'X (Twitter)' : 'LinkedIn'} Post
          </span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.classes}`}>
          {badge.label}
        </span>
      </div>

      <div className="p-5">
        {/* Image Preview */}
        {post.imageUrl ? (
          <div className="relative mb-4 overflow-hidden rounded-xl bg-white/5">
            <PostImage
              src={post.imageUrl}
              alt="Post image"
              className="h-48 w-full object-cover sm:h-56"
              fallbackClassName="flex h-48 w-full items-center justify-center bg-white/5 text-xs text-text-muted sm:h-56"
            />
            {post.status !== 'published' && post.status !== 'scheduled' && (
              <button
                onClick={() => onRegenerateImage(post.id)}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644v-4.992"
                  />
                </svg>
                Regenerate
              </button>
            )}
          </div>
        ) : post.status === 'generating' ? (
          <div className="mb-4 flex h-48 items-center justify-center rounded-xl bg-white/5">
            <div className="text-center">
              <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-xs text-text-muted">Generating image...</p>
            </div>
          </div>
        ) : null}

        {/* Caption */}
        {editing ? (
          <div className="mb-4">
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              rows={platform === 'linkedin' ? 8 : 3}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-text-muted">
                {platform === 'x'
                  ? `${editCaption.length}/280 characters`
                  : `${editCaption.split(/\s+/).length} words`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveCaption}
                  className="rounded-lg bg-accent/20 px-3 py-1 text-xs text-accent hover:bg-accent/30"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditCaption(post.caption);
                  }}
                  className="rounded-lg bg-white/5 px-3 py-1 text-xs text-text-muted hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                {post.caption}
              </p>
            </div>
            {post.status !== 'published' && (
              <button
                onClick={() => setEditing(true)}
                className="mt-2 flex items-center gap-1 text-xs text-text-muted hover:text-accent"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z"
                  />
                </svg>
                Edit Caption
              </button>
            )}
          </div>
        )}

        {/* Meta info */}
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          <span>{platform === 'x' ? `${charCount} chars` : `${wordCount} words`}</span>
          <span className="text-white/10">|</span>
          <span>{hashtagCount} hashtags</span>
          {post.topicTitle && (
            <>
              <span className="text-white/10">|</span>
              <span className="truncate" title={post.topicTitle}>
                Topic: {post.topicTitle}
              </span>
            </>
          )}
          {score && (
            <>
              <span className="text-white/10">|</span>
              <span>Score: {score}</span>
            </>
          )}
        </div>

        {/* Scheduled time display */}
        {post.scheduledAt && post.status === 'scheduled' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            Scheduled for {new Date(post.scheduledAt).toLocaleString()}
          </div>
        )}

        {/* Schedule picker */}
        {showSchedule && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm font-medium text-white">Schedule Post</p>
            {/* Optimal time suggestions */}
            {optimalSlots.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-[11px] text-text-muted/60">
                  Suggested times (based on your engagement data)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {optimalSlots.slice(0, 3).map((slot, i) => {
                    // Find the next occurrence of this day+hour
                    const now = new Date();
                    const targetDay = slot.day_of_week;
                    const targetHour = slot.hour;
                    const currentDay = now.getDay();
                    let daysUntil = targetDay - currentDay;
                    if (daysUntil < 0) daysUntil += 7;
                    if (daysUntil === 0 && now.getHours() >= targetHour) daysUntil = 7;
                    const targetDate = new Date(now);
                    targetDate.setDate(targetDate.getDate() + daysUntil);
                    const dateStr = targetDate.toISOString().split('T')[0];
                    const timeStr = `${targetHour.toString().padStart(2, '0')}:00`;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setScheduleDate(dateStr);
                          setScheduleTime(timeStr);
                        }}
                        className="rounded-lg border border-green-500/20 bg-green-500/5 px-2.5 py-1.5 text-[11px] text-green-400 transition-colors hover:bg-green-500/15"
                      >
                        {DAY_NAMES[slot.day_of_week]} {targetHour}:00
                        <span className="ml-1 text-[10px] text-green-400/50">
                          ({slot.avg_engagement.toFixed(1)} avg)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              />
              <select
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              >
                {Array.from({ length: 96 }, (_, i) => {
                  const hours = Math.floor(i / 4);
                  const minutes = (i % 4) * 15;
                  const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                  return (
                    <option key={time} value={time} className="bg-[#111125]">
                      {time}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSchedule}
                disabled={!scheduleDate}
                className="rounded-lg bg-blue-500/20 px-4 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/30 disabled:opacity-40"
              >
                Confirm Schedule
              </button>
              <button
                onClick={() => setShowSchedule(false)}
                className="rounded-lg bg-white/5 px-4 py-1.5 text-xs text-text-muted hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {post.status === 'review' && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowSchedule(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-500/25"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              Schedule
            </button>
            <button
              onClick={() => onPublishNow(post)}
              className="flex items-center gap-1.5 rounded-lg bg-green-500/15 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/25"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
              Publish Now
            </button>
            <AddToSheetsButton
              getToken={getToken}
              payload={{
                platform: post.platform === 'x' ? 'Twitter' : 'LinkedIn',
                content: post.caption,
                timestamp: sheetsTimestamp,
                imageUrl: post.imageUrl,
              }}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            />
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto rounded-lg bg-white/5 px-3 py-2 text-sm text-text-muted/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
              </button>
            ) : (
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => onDelete(post.id)}
                  className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/30"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// Platform Preview Mockups
function LinkedInPreview({ post }: { post: Post }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-white/5 px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted/60">
          LinkedIn Preview
        </span>
      </div>
      <div className="p-4">
        {/* Profile header */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A66C2]/20">
            <span className="text-xs font-bold text-[#0A66C2]">T</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">TechJM</p>
            <p className="text-[11px] text-text-muted">1h</p>
          </div>
        </div>
        {/* Caption */}
        <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
          {post.caption.slice(0, 400)}
          {post.caption.length > 400 ? '...' : ''}
        </p>
        {/* Image */}
        {post.imageUrl && (
          <div className="mb-3 overflow-hidden rounded-lg">
            <PostImage
              src={post.imageUrl}
              alt="LinkedIn preview"
              className="h-40 w-full object-cover"
            />
          </div>
        )}
        {/* Engagement bar */}
        <div className="flex items-center gap-6 border-t border-white/5 pt-3 text-[11px] text-text-muted/60">
          <span>Like</span>
          <span>Comment</span>
          <span>Repost</span>
          <span>Send</span>
        </div>
      </div>
    </GlassCard>
  );
}

function XPreview({ post }: { post: Post }) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="border-b border-white/5 px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted/60">
          X Preview
        </span>
      </div>
      <div className="p-4">
        {/* Profile header */}
        <div className="mb-2 flex items-start gap-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
            <span className="text-xs font-bold text-white">T</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">TechJM</span>
              <span className="text-[13px] text-text-muted">@techjm</span>
              <span className="text-text-muted/40">&middot;</span>
              <span className="text-[13px] text-text-muted">1h</span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-white/80">{post.caption}</p>
            {/* Image */}
            {post.imageUrl && (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                <PostImage
                  src={post.imageUrl}
                  alt="X preview"
                  className="h-36 w-full object-cover"
                />
              </div>
            )}
            {/* Engagement bar */}
            <div className="mt-3 flex items-center gap-8 text-[11px] text-text-muted/60">
              <span>Reply</span>
              <span>Repost</span>
              <span>Like</span>
              <span>Views</span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export default function ContentStudioPage() {
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof STATUS_TABS)[number]>('review');
  const [previewPost, setPreviewPost] = useState<Post | null>(null);
  const [optimalSlots, setOptimalSlots] = useState<OptimalSlot[]>([]);

  const getToken = useCallback(async () => {
    if (!user) return '';
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    try {
      return (await auth.currentUser?.getIdToken()) || '';
    } catch (error) {
      console.error('Failed to get Firebase auth token:', error);
      return '';
    }
  }, [user]);

  const fetchPosts = useCallback(
    async (options?: { silent?: boolean }) => {
      if (authLoading) {
        return;
      }

      if (!user) {
        setPosts([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      try {
        const token = await getToken();
        if (!token) {
          setLoading(false);
          return;
        }
        const params = new URLSearchParams({ status: activeTab });
        const res = await fetch(`/api/posts?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPosts(data.posts);
          setTotal(data.total);
        }
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [activeTab, authLoading, getToken, user],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }
    fetchPosts();
  }, [authLoading, fetchPosts]);

  // Fetch optimal posting times from learning data
  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/analytics/learning', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOptimalSlots(data.optimalTimes?.best_hours ?? []);
        }
      } catch {
        // Non-critical
      }
    })();
  }, [authLoading, getToken, user]);

  // Poll while content is actively moving through generation/review states.
  // Without this, posts created shortly after topic approval can remain invisible
  // until a manual refresh because the current tab may initially return zero rows.
  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    if (activeTab === 'review' || activeTab === 'generating') {
      const interval = setInterval(() => {
        fetchPosts({ silent: true });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, authLoading, fetchPosts, user]);

  const handleEditCaption = async (id: string, caption: string) => {
    const token = await getToken();
    if (!token) {
      alert('Your session expired. Please sign in again.');
      return;
    }
    await fetch(`/api/posts/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption }),
    });
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const handleRegenerateImage = async (id: string) => {
    const token = await getToken();
    if (!token) {
      alert('Your session expired. Please sign in again.');
      return;
    }
    await fetch(`/api/posts/${id}/regenerate-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'generating', imageUrl: null } : p)),
    );
  };

  const handleSchedule = async (id: string, scheduledAt: string) => {
    const token = await getToken();
    if (!token) {
      alert('Your session expired. Please sign in again.');
      return;
    }
    await fetch(`/api/posts/${id}/schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt }),
    });
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'scheduled', scheduledAt } : p)),
    );
  };

  const handlePublishNow = async (post: Post) => {
    if (!confirm('Publish this post now?')) return;
    const token = await getToken();
    if (!token) {
      alert('Your session expired. Please sign in again.');
      return;
    }

    if (post.platform === 'linkedin') {
      const hashtags = (post.hashtags || []).join(' ');
      const response = await fetch('/api/publish-linkedin', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: post.caption,
          hashtags,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        alert(data?.error || 'LinkedIn automation failed.');
        return;
      }

      alert('Posted to LinkedIn successfully.');
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, status: 'published', publishedAt: new Date().toISOString() }
            : p,
        ),
      );
      return;
    }

    const response = await fetch(`/api/posts/${post.id}/publish-now`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      alert(data?.error || 'Failed to publish now.');
      return;
    }

    alert('Publishing now...');
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id ? { ...p, status: 'scheduled', scheduledAt: new Date().toISOString() } : p,
      ),
    );
  };

  const handleDelete = async (id: string) => {
    const token = await getToken();
    if (!token) {
      alert('Your session expired. Please sign in again.');
      return;
    }
    await fetch(`/api/posts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setTotal((prev) => prev - 1);
  };

  // Group posts by topic
  const groupedPosts = posts.reduce(
    (acc, post) => {
      const key = post.topicId || post.id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(post);
      return acc;
    },
    {} as Record<string, Post[]>,
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Studio</h1>
          <p className="mt-1 text-sm text-text-muted">
            Review and polish your AI-generated content before scheduling
          </p>
        </div>
        <button
          onClick={() => {
            void fetchPosts();
          }}
          className="glass rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:text-white"
        >
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-1.5 text-sm capitalize transition-colors ${
              activeTab === tab
                ? 'bg-accent/20 font-medium text-accent'
                : 'text-text-muted hover:text-white'
            }`}
          >
            {tab === 'review' ? 'Ready for Review' : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : posts.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center p-16">
          <svg
            className="mb-4 h-12 w-12 text-text-muted/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
            />
          </svg>
          <p className="mb-1 text-base text-text-muted">No content yet</p>
          <p className="text-center text-sm text-text-muted/50">
            {activeTab === 'review'
              ? 'Approve topics in Topic Review to start generating content.'
              : `No ${activeTab} posts.`}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPosts).map(([topicId, topicPosts]) => (
            <div key={topicId}>
              {/* Topic group header */}
              {topicPosts[0]?.topicTitle && (
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/5" />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted/50">
                    {topicPosts[0].topicTitle}
                  </span>
                  <div className="h-px flex-1 bg-white/5" />
                </div>
              )}

              {/* Post cards grid */}
              <div className="grid gap-4 lg:grid-cols-2">
                {topicPosts.map((post) => (
                  <div key={post.id}>
                    <PostCard
                      post={post}
                      optimalSlots={optimalSlots}
                      getToken={getToken}
                      onEditCaption={handleEditCaption}
                      onRegenerateImage={handleRegenerateImage}
                      onSchedule={handleSchedule}
                      onPublishNow={handlePublishNow}
                      onDelete={handleDelete}
                    />
                    {/* Preview toggle */}
                    <button
                      onClick={() => setPreviewPost(previewPost?.id === post.id ? null : post)}
                      className="mt-2 text-[11px] text-text-muted/40 hover:text-text-muted"
                    >
                      {previewPost?.id === post.id ? 'Hide Preview' : 'Show Platform Preview'}
                    </button>
                    {previewPost?.id === post.id && (
                      <div className="mt-2">
                        {post.platform === 'linkedin' ? (
                          <LinkedInPreview post={post} />
                        ) : (
                          <XPreview post={post} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
