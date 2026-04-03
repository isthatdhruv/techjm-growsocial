'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { GlassCard } from '@/app/components/glass-card';

type ScoredTopic = {
  id: string;
  rawTopicId: string;
  status: string;
  finalScore: string | null;
  sentimentScore: string | null;
  sentimentRiskFlag: boolean | null;
  audienceFitScore: string | null;
  audiencePersonas: string[] | null;
  seoScore: string | null;
  seoHashtags: string[] | null;
  seoKeywords: string[] | null;
  competitorGapScore: string | null;
  competitorDiffAngle: string | null;
  cmfScore: string | null;
  cmfLinkedService: string | null;
  cmfCtaNatural: boolean | null;
  engagementPredLikes: number | null;
  engagementPredComments: number | null;
  engagementPredConfidence: string | null;
  pillarBoost: string | null;
  consensusMultiplier: string | null;
  subAgentOutputs: Record<string, any> | null;
  scoredAt: string | null;
  title: string;
  angle: string | null;
  reasoning: string | null;
  sourceUrls: string[] | null;
  xPostUrls: string[] | null;
  consensusTier: string | null;
  consensusCount: number | null;
  sourceLlm: string;
  provider: string;
  model: string;
  controversyLevel: number | null;
  suggestedPlatform: string | null;
};

type UploadSearchResult = {
  chunkId: string;
  documentId: string;
  fileName: string;
  content: string;
  score: number;
};

const STATUS_TABS = ['pending', 'approved', 'rejected', 'all'] as const;
const SORT_OPTIONS = [
  { value: 'score', label: 'Score' },
  { value: 'newest', label: 'Newest' },
  { value: 'consensus', label: 'Consensus' },
];

const TIER_BADGES: Record<string, { label: string; color: string }> = {
  definitive: { label: 'Definitive', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  strong: { label: 'Strong', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  confirmed: { label: 'Confirmed', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  experimental: { label: 'Experimental', color: 'bg-white/10 text-text-muted border-white/10' },
};

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-400';
  if (score >= 6) return 'text-yellow-400';
  if (score >= 4) return 'text-orange-400';
  return 'text-red-400';
}

function TopicCard({
  topic,
  weightInfo,
  onApprove,
  onReject,
  onSaveEdit,
}: {
  topic: ScoredTopic;
  weightInfo: { isAdaptive: boolean; lastUpdated: string | null; totalPosts: number } | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSaveEdit: (id: string, angle: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editAngle, setEditAngle] = useState(topic.angle || '');

  const score = parseFloat(topic.finalScore || '0');
  const tier = topic.consensusTier || 'experimental';
  const tierBadge = TIER_BADGES[tier] || TIER_BADGES.experimental;
  const canReview = topic.status === 'pending' || topic.status === 'scoring';

  const handleSaveEdit = () => {
    onSaveEdit(topic.id, editAngle);
    setEditing(false);
  };

  return (
    <GlassCard className="overflow-hidden transition-all duration-200">
      {/* Main card content */}
      <div className="p-5">
        {/* Top row: tier badge + score */}
        <div className="mb-3 flex items-start justify-between">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${tierBadge.color}`}
          >
            {tierBadge.label}
            {topic.consensusCount && topic.consensusCount > 1
              ? ` (${topic.consensusCount} slots)`
              : ''}
          </span>
          <div className="text-right">
            <span className={`text-xl font-bold ${getScoreColor(score)}`}>
              {topic.status === 'scoring' || topic.finalScore === null ? '...' : score.toFixed(2)}
            </span>
            <p className="text-[10px] text-text-muted">score</p>
          </div>
        </div>

        {/* Weight source badge */}
        {weightInfo && (
          <div className="mb-2">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${
                weightInfo.isAdaptive
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-white/5 text-text-muted/60'
              }`}
              title={
                weightInfo.isAdaptive
                  ? `Based on ${weightInfo.totalPosts} posts of engagement data`
                  : 'Collecting data to optimize weights'
              }
            >
              {weightInfo.isAdaptive
                ? `Adaptive weights${weightInfo.lastUpdated ? ` (updated ${formatRelative(weightInfo.lastUpdated)})` : ''}`
                : `Default weights (collecting data\u2026)`}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className="mb-1 text-base font-semibold text-white">{topic.title}</h3>

        {/* Angle (editable) */}
        {editing ? (
          <div className="mb-3">
            <textarea
              value={editAngle}
              onChange={(e) => setEditAngle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-muted focus:border-accent/50 focus:outline-none"
              rows={3}
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-accent/20 px-3 py-1 text-xs text-accent hover:bg-accent/30"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditAngle(topic.angle || '');
                }}
                className="rounded-lg bg-white/5 px-3 py-1 text-xs text-text-muted hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          topic.angle && (
            <p className="mb-3 text-sm text-text-muted">{topic.angle}</p>
          )
        )}

        {/* Mini score bar (collapsed view) */}
        {topic.status !== 'scoring' && (
          <div className="mb-3 grid grid-cols-6 gap-2 text-center">
            {[
              { label: 'Sent.', value: topic.sentimentScore, parse: (v: string) => ((parseFloat(v) + 1) * 5).toFixed(1) },
              { label: 'Aud.', value: topic.audienceFitScore, parse: (v: string) => v },
              { label: 'SEO', value: topic.seoScore, parse: (v: string) => v },
              { label: 'Gap', value: topic.competitorGapScore, parse: (v: string) => v },
              { label: 'CMF', value: topic.cmfScore, parse: (v: string) => v },
              { label: 'Eng.', value: topic.engagementPredConfidence, parse: (v: string) => (parseFloat(v) * 10).toFixed(1) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-white/5 px-1 py-1.5">
                <p className="text-[10px] text-text-muted/60">{item.label}</p>
                <p className="text-xs font-medium text-white">
                  {item.value ? item.parse(item.value) : '-'}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {topic.sourceUrls && (topic.sourceUrls as string[]).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(topic.sourceUrls as string[]).slice(0, 3).map((url, i) => {
              let hostname = '';
              try {
                hostname = new URL(url).hostname.replace('www.', '');
              } catch {
                hostname = 'link';
              }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[11px] text-text-muted hover:text-accent"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-4.318a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.757 8.25" />
                  </svg>
                  {hostname}
                </a>
              );
            })}
            {(topic.sourceUrls as string[]).length > 3 && (
              <span className="text-[11px] text-text-muted/40">
                +{(topic.sourceUrls as string[]).length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canReview && (
            <>
              <button
                onClick={() => onApprove(topic.id)}
                className="rounded-lg bg-green-500/15 px-4 py-1.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/25"
              >
                Approve
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg bg-white/5 px-4 py-1.5 text-sm text-text-muted transition-colors hover:bg-white/10"
              >
                Edit Angle
              </button>
              <button
                onClick={() => onReject(topic.id)}
                className="rounded-lg bg-red-500/10 px-4 py-1.5 text-sm text-red-400/70 transition-colors hover:bg-red-500/20"
              >
                Reject
              </button>
            </>
          )}
          {topic.status === 'approved' && (
            <span className="rounded-lg bg-green-500/10 px-3 py-1 text-xs text-green-400">
              Approved
            </span>
          )}
          {topic.status === 'rejected' && (
            <span className="rounded-lg bg-red-500/10 px-3 py-1 text-xs text-red-400/60">
              Rejected
            </span>
          )}
          {topic.status === 'scoring' && (
            <span className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-1 text-xs text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              Scoring in progress, but you can still review it.
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-white/10"
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded sub-agent detail */}
      {expanded && topic.subAgentOutputs && (
        <div className="border-t border-white/5 bg-white/[0.02] p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">
            Sub-Agent Analysis
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Sentiment */}
            <SubAgentDetail
              label="Sentiment"
              data={topic.subAgentOutputs.sentiment}
              score={topic.sentimentScore}
              renderExtra={(d) => (
                <>
                  {topic.sentimentRiskFlag && (
                    <p className="text-[11px] text-red-400">Risk flagged</p>
                  )}
                  {d?.risk_reasons?.length > 0 && (
                    <p className="text-[11px] text-text-muted/60">
                      {(d.risk_reasons as string[]).join(', ')}
                    </p>
                  )}
                  {d?.summary && (
                    <p className="text-[11px] text-text-muted">{d.summary}</p>
                  )}
                </>
              )}
            />
            {/* Audience Fit */}
            <SubAgentDetail
              label="Audience Fit"
              data={topic.subAgentOutputs.audience_fit}
              score={topic.audienceFitScore}
              renderExtra={(d) => (
                <>
                  {(topic.audiencePersonas as string[] | null)?.length ? (
                    <p className="text-[11px] text-text-muted">
                      {(topic.audiencePersonas as string[]).join(', ')}
                    </p>
                  ) : null}
                  {d?.reasoning && (
                    <p className="mt-1 text-[11px] text-text-muted/60">{d.reasoning}</p>
                  )}
                </>
              )}
            />
            {/* SEO */}
            <SubAgentDetail
              label="SEO"
              data={topic.subAgentOutputs.seo}
              score={topic.seoScore}
              renderExtra={() => (
                <>
                  {(topic.seoHashtags as string[] | null)?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {(topic.seoHashtags as string[]).slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent/80"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            />
            {/* Competitor Gap */}
            <SubAgentDetail
              label="Competitor Gap"
              data={topic.subAgentOutputs.competitor_gap}
              score={topic.competitorGapScore}
              renderExtra={(d) => (
                <>
                  {topic.competitorDiffAngle && (
                    <p className="text-[11px] text-text-muted">{topic.competitorDiffAngle}</p>
                  )}
                  {d?.saturation_level && (
                    <p className="text-[11px] text-text-muted/60">
                      Saturation: {d.saturation_level}
                    </p>
                  )}
                </>
              )}
            />
            {/* Content-Market Fit */}
            <SubAgentDetail
              label="Content-Market Fit"
              data={topic.subAgentOutputs.content_market_fit}
              score={topic.cmfScore}
              renderExtra={(d) => (
                <>
                  {topic.cmfLinkedService && (
                    <p className="text-[11px] text-text-muted">
                      Service: {topic.cmfLinkedService}
                    </p>
                  )}
                  {d?.cta_suggestion && (
                    <p className="text-[11px] italic text-text-muted/60">
                      &quot;{d.cta_suggestion}&quot;
                    </p>
                  )}
                </>
              )}
            />
            {/* Engagement */}
            <SubAgentDetail
              label="Engagement"
              data={topic.subAgentOutputs.engagement_predictor}
              score={topic.engagementPredConfidence}
              renderExtra={(d) => (
                <>
                  <p className="text-[11px] text-text-muted">
                    Predicted: {topic.engagementPredLikes ?? 0} likes, {topic.engagementPredComments ?? 0} comments
                  </p>
                  {d?.virality_potential && (
                    <p className="text-[11px] text-text-muted/60">
                      Virality: {d.virality_potential}
                    </p>
                  )}
                </>
              )}
            />
            {/* Pillar Balancer */}
            <SubAgentDetail
              label="Pillar Balance"
              data={topic.subAgentOutputs.pillar_balancer}
              score={topic.pillarBoost}
              renderExtra={(d) => (
                <>
                  {d?.primary_pillar && (
                    <p className="text-[11px] text-text-muted">Pillar: {d.primary_pillar}</p>
                  )}
                  {d?.balance_assessment && (
                    <p className="text-[11px] text-text-muted/60">
                      Balance: {d.balance_assessment}
                    </p>
                  )}
                </>
              )}
            />
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function SubAgentDetail({
  label,
  data,
  score,
  renderExtra,
}: {
  label: string;
  data: any;
  score: string | null;
  renderExtra: (data: any) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-medium text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-white">{score ?? '-'}</p>
      </div>
      <div className="space-y-1">{renderExtra(data)}</div>
    </div>
  );
}

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TopicReviewPage() {
  const { user } = useAuth();
  const [topics, setTopics] = useState<ScoredTopic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof STATUS_TABS)[number]>('pending');
  const [sort, setSort] = useState('score');
  const [search, setSearch] = useState('');
  const [triggeringDiscovery, setTriggeringDiscovery] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [activeDiscovery, setActiveDiscovery] = useState<{
    runId: string;
    mergeJobId: string | null;
    slotsTotal: number;
  } | null>(null);
  const [discoverySource, setDiscoverySource] = useState<'web' | 'uploads' | 'both'>('web');
  const [manualQuery, setManualQuery] = useState('');
  const [uploadMatches, setUploadMatches] = useState<UploadSearchResult[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [weightInfo, setWeightInfo] = useState<{
    isAdaptive: boolean;
    lastUpdated: string | null;
    totalPosts: number;
  } | null>(null);

  const getToken = useCallback(async () => {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    return auth.currentUser?.getIdToken() || '';
  }, []);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        status: activeTab,
        sort,
        ...(search ? { search } : {}),
      });
      const res = await fetch(`/api/topics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTopics(data.topics);
        setTotal(data.total);
        setUploadMatches([]);
      }
    } catch (err) {
      console.error('Failed to fetch topics:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, sort, search, getToken]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    if (!activeDiscovery) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getToken();
        const params = new URLSearchParams({
          runId: activeDiscovery.runId,
          slotsTotal: String(activeDiscovery.slotsTotal),
          ...(activeDiscovery.mergeJobId ? { mergeJobId: activeDiscovery.mergeJobId } : {}),
        });
        const res = await fetch(`/api/discovery/status?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        if (data.status === 'complete') {
          setDiscoveryMessage(
            data.topicsAfterMerge
              ? `Discovery finished with ${data.topicsAfterMerge} topic${data.topicsAfterMerge === 1 ? '' : 's'}.`
              : 'Discovery finished, but no topics survived merging.',
          );
          setActiveDiscovery(null);
          fetchTopics();
          return;
        }

        if (data.status === 'failed') {
          setDiscoveryError(data.error || 'Discovery failed.');
          setDiscoveryMessage(null);
          setActiveDiscovery(null);
          return;
        }

        setDiscoveryMessage(
          `Discovery running: ${data.slotsCompleted || 0}/${data.slotsTotal || 0} slots complete, ${data.topicsFound || 0} topic${data.topicsFound === 1 ? '' : 's'} found so far.`,
        );
        window.setTimeout(poll, 3000);
      } catch {
        if (!cancelled) {
          window.setTimeout(poll, 5000);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [activeDiscovery, fetchTopics, getToken]);

  // Fetch weight learning info
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/analytics/learning', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWeightInfo({
            isAdaptive: data.maturity.stage !== 'collecting',
            lastUpdated: data.weights.lastUpdated,
            totalPosts: data.maturity.totalPosts,
          });
        }
      } catch {
        // Non-critical
      }
    })();
  }, [getToken]);

  const handleApprove = async (id: string) => {
    const token = await getToken();
    const res = await fetch(`/api/topics/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('Failed to approve topic:', payload?.error || payload || '');
      setDiscoveryError(payload?.error || 'Failed to approve topic.');
      return;
    }
    if (payload?.message) {
      setDiscoveryMessage(payload.message);
    }
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'approved' } : t)));
  };

  const handleReject = async (id: string) => {
    const token = await getToken();
    await fetch(`/api/topics/${id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'rejected' } : t)));
  };

  const handleSaveEdit = async (id: string, angle: string) => {
    const token = await getToken();
    await fetch(`/api/topics/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ angle }),
    });
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, angle } : t)));
  };

  const handleRunDiscovery = async () => {
    setTriggeringDiscovery(true);
    setDiscoveryError(null);
    setDiscoveryMessage(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const isUploadMode = discoverySource === 'uploads';
      const isCombinedMode = discoverySource === 'both';
      const route = isUploadMode ? '/api/knowledge/discover' : '/api/discovery/trigger';
      const trimmedQuery = manualQuery.trim();
      const body =
        isUploadMode || isCombinedMode
          ? JSON.stringify({ query: trimmedQuery, save: true, source: discoverySource })
          : trimmedQuery
            ? JSON.stringify({ query: trimmedQuery })
            : undefined;

      const res = await fetch(route, {
        method: 'POST',
        headers,
        ...(body ? { body } : {}),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setDiscoveryError(payload?.error || 'Failed to start discovery.');
        return;
      }

      if (isUploadMode) {
        setDiscoveryMessage(
          payload?.saved
            ? `Created ${payload.saved} topic${payload.saved === 1 ? '' : 's'} from uploads.`
            : 'Upload discovery completed.',
        );
        setActiveDiscovery(null);
        fetchTopics();
        return;
      }

      let combinedSaved = 0;
      if (isCombinedMode) {
        const uploadRes = await fetch('/api/knowledge/discover', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: trimmedQuery, save: true }),
        });
        const uploadPayload = await uploadRes.json().catch(() => null);
        if (uploadRes.ok && uploadPayload?.saved) {
          combinedSaved = uploadPayload.saved;
        }
      }

      setDiscoveryMessage(
        payload?.slotsQueued
          ? `Discovery started across ${payload.slotsQueued} model slot${payload.slotsQueued === 1 ? '' : 's'}${payload?.focusQuery ? ` for "${payload.focusQuery}"` : ''}${combinedSaved ? ` and created ${combinedSaved} upload topic${combinedSaved === 1 ? '' : 's'}` : ''}.`
          : 'Discovery started successfully.',
      );
      setActiveDiscovery(
        payload?.discoveryRunId
          ? {
              runId: payload.discoveryRunId,
              mergeJobId: payload?.mergeJobId || null,
              slotsTotal: payload?.slotsQueued || 4,
            }
          : null,
      );
      fetchTopics();
    } catch (err) {
      console.error('Failed to trigger discovery:', err);
      setDiscoveryError('Failed to start discovery. Please try again.');
    } finally {
      setTriggeringDiscovery(false);
    }
  };

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setManualSearching(true);
    setDiscoveryError(null);
    setDiscoveryMessage(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/topics/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: manualQuery.trim(),
          source: discoverySource === 'web' ? 'topics' : discoverySource,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setDiscoveryError(payload?.error || 'Search failed.');
        return;
      }

      setTopics(payload?.topics || []);
      setTotal(payload?.topics?.length || 0);
      setUploadMatches(payload?.uploads || []);
      setDiscoveryMessage(
        payload?.message ||
          `Found ${(payload?.topics || []).length} topic match(es) and ${(payload?.uploads || []).length} upload match(es).`,
      );
    } catch (error) {
      console.error('Manual search failed:', error);
      setDiscoveryError('Search failed. Please try again.');
    } finally {
      setManualSearching(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Topic Review</h1>
          <p className="mt-1 text-sm text-text-muted">
            {total > 0
              ? `AI discovered ${total} topics. Review and approve the best ones.`
              : 'No topics yet. Run discovery to find trending topics.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTopics}
            className="glass rounded-lg px-4 py-2 text-sm text-text-muted transition-colors hover:text-white"
          >
            Refresh
          </button>
          <button
            onClick={handleRunDiscovery}
            disabled={triggeringDiscovery}
            className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-50"
          >
            {triggeringDiscovery ? 'Starting...' : 'Run Discovery'}
          </button>
          <button
            onClick={handleManualSearch}
            disabled={manualSearching}
            className="rounded-lg bg-white/5 px-4 py-2 text-sm text-text-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            {manualSearching ? 'Searching...' : discoverySource === 'uploads' ? 'Search Uploads' : 'Search Topics'}
          </button>
        </div>
      </div>

      {discoveryError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {discoveryError}
        </div>
      )}

      {discoveryMessage && (
        <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          {discoveryMessage}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-4 lg:flex-row">
        <select
          value={discoverySource}
          onChange={(event) => setDiscoverySource(event.target.value as 'web' | 'uploads' | 'both')}
          className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        >
          <option value="web" className="bg-[#111125]">Web</option>
          <option value="uploads" className="bg-[#111125]">Uploads</option>
          <option value="both" className="bg-[#111125]">Both</option>
        </select>
        <input
          value={manualQuery}
          onChange={(event) => setManualQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleManualSearch();
            }
          }}
          placeholder="Search topics, uploads, or focus discovery on a phrase"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/50 focus:outline-none"
        />
      </div>

      {uploadMatches.length > 0 && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {uploadMatches.map((match) => (
            <GlassCard key={match.chunkId} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-widest text-text-muted/70">
                  {match.fileName}
                </p>
                <span className="text-[11px] text-accent">score {match.score.toFixed(2)}</span>
              </div>
              <p className="text-sm leading-relaxed text-white/85">{match.content}</p>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
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
              {tab}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="glass rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-text-muted focus:border-accent/50 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-[#111125]">
                {opt.label}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search topics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-sm text-white placeholder-text-muted/40 focus:border-accent/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Topic list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : topics.length === 0 ? (
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
              d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
          <p className="mb-1 text-base text-text-muted">No topics found</p>
          <p className="mb-4 text-sm text-text-muted/50">
            {activeTab === 'pending'
              ? 'Run discovery to find trending topics in your niche.'
              : `No ${activeTab} topics yet.`}
          </p>
          {activeTab === 'pending' && (
            <button
              onClick={handleRunDiscovery}
              disabled={triggeringDiscovery}
              className="rounded-lg bg-accent/20 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
            >
              Run Discovery
            </button>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              weightInfo={weightInfo}
              onApprove={handleApprove}
              onReject={handleReject}
              onSaveEdit={handleSaveEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
