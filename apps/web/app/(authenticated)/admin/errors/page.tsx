'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlassCard } from '@/app/components/glass-card';

interface JobError {
  id: string;
  userId: string | null;
  userEmail: string | null;
  jobType: string;
  jobId: string;
  errorCategory: string;
  errorMessage: string;
  context: Record<string, unknown> | null;
  stack: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  unresolved: number;
  range: string;
  categories: { category: string; count: number }[];
}

const CATEGORIES = [
  'all',
  'INVALID_KEY',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'TOKEN_EXPIRED',
  'DATA_NOT_FOUND',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
];

export default function ErrorDashboardPage() {
  const [errors, setErrors] = useState<JobError[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [category, setCategory] = useState('all');
  const [range, setRange] = useState('24h');
  const [showResolved, setShowResolved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ range, resolved: String(showResolved) });
    if (category !== 'all') params.set('category', category);

    const res = await fetch(`/api/admin/errors?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setErrors(data.errors);
      setStats(data.stats);
    }
    setLoading(false);
  }, [category, range, showResolved]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  async function resolveError(id: string) {
    await fetch('/api/admin/errors', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getToken()}`,
      },
      body: JSON.stringify({ id }),
    });
    fetchErrors();
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const categoryColor: Record<string, string> = {
    INVALID_KEY: 'text-red-400',
    RATE_LIMITED: 'text-yellow-400',
    PROVIDER_ERROR: 'text-orange-400',
    TOKEN_EXPIRED: 'text-purple-400',
    DATA_NOT_FOUND: 'text-blue-400',
    NETWORK_ERROR: 'text-cyan-400',
    INTERNAL_ERROR: 'text-red-500',
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-white">Job Errors</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <GlassCard>
            <div className="p-4 text-center">
              <div className="text-3xl font-bold text-white">{stats.total}</div>
              <div className="text-sm text-white/60">Total ({range})</div>
            </div>
          </GlassCard>
          <GlassCard>
            <div className="p-4 text-center">
              <div className="text-3xl font-bold text-red-400">{stats.unresolved}</div>
              <div className="text-sm text-white/60">Unresolved</div>
            </div>
          </GlassCard>
          <GlassCard>
            <div className="p-4 text-center">
              <div className="text-3xl font-bold text-white">
                {stats.categories.reduce((max, c) => (c.count > max.count ? c : max), { category: '-', count: 0 }).category}
              </div>
              <div className="text-sm text-white/60">Most Common</div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Filters */}
      <GlassCard>
        <div className="flex flex-wrap items-center gap-4 p-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-gray-900">
                {c === 'all' ? 'All Categories' : c}
              </option>
            ))}
          </select>

          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
          >
            <option value="24h" className="bg-gray-900">Last 24h</option>
            <option value="7d" className="bg-gray-900">Last 7 days</option>
            <option value="30d" className="bg-gray-900">Last 30 days</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded"
            />
            Show resolved
          </label>
        </div>
      </GlassCard>

      {/* Error Table */}
      <GlassCard>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-white/50">Loading...</div>
          ) : errors.length === 0 ? (
            <div className="p-8 text-center text-white/50">No errors found</div>
          ) : (
            <table className="w-full text-sm text-white">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/50">
                  <th className="p-3">Time</th>
                  <th className="p-3">Job Type</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Message</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => (
                  <>
                    <tr key={err.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white/60">{timeAgo(err.createdAt)}</td>
                      <td className="p-3 font-mono text-xs">{err.jobType}</td>
                      <td className={`p-3 font-medium ${categoryColor[err.errorCategory] || 'text-white'}`}>
                        {err.errorCategory}
                      </td>
                      <td className="p-3 text-white/60">{err.userEmail || '-'}</td>
                      <td className="max-w-xs truncate p-3">{err.errorMessage}</td>
                      <td className="flex gap-2 p-3">
                        <button
                          onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                        >
                          Details
                        </button>
                        {!err.resolved && (
                          <button
                            onClick={() => resolveError(err.id)}
                            className="rounded bg-green-500/20 px-2 py-1 text-xs text-green-400 hover:bg-green-500/30"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === err.id && (
                      <tr key={`${err.id}-detail`} className="border-b border-white/5">
                        <td colSpan={6} className="p-4">
                          <div className="space-y-2 rounded-lg bg-black/30 p-4 font-mono text-xs">
                            <div><span className="text-white/50">Job ID:</span> {err.jobId}</div>
                            {err.context && (
                              <div>
                                <span className="text-white/50">Context:</span>
                                <pre className="mt-1 max-h-40 overflow-auto text-white/70">
                                  {JSON.stringify(err.context, null, 2)}
                                </pre>
                              </div>
                            )}
                            {err.stack && (
                              <div>
                                <span className="text-white/50">Stack:</span>
                                <pre className="mt-1 max-h-40 overflow-auto text-white/40">
                                  {err.stack}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

async function getToken(): Promise<string> {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  return token || '';
}
