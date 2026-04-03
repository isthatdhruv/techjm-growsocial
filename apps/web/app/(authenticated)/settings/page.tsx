'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { GlassCard } from '../../components/glass-card';

function decodeHtmlEntities(value: string) {
  if (typeof window === 'undefined') {
    return value;
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

type SettingsTab = 'niche' | 'ai' | 'socials' | 'notifications' | 'account';

interface AiKeyEntry {
  id: string;
  provider: string;
  capabilities: Record<string, unknown>;
  validatedAt: string | null;
  createdAt: string;
}

interface ModelSlot {
  provider: string;
  model: string;
}

interface ResolvedProvider {
  provider: string;
  source: 'user' | 'env';
  status: 'available' | 'unavailable';
  models: string[];
  capabilities: {
    web_search: boolean;
    x_search: boolean;
    image_gen: boolean;
  };
}

async function getToken() {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  return auth.currentUser?.getIdToken();
}

// ─── Provider Info ──────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', color: 'text-green-400', linkText: 'platform.openai.com', linkUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', color: 'text-orange-400', linkText: 'console.anthropic.com', linkUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google AI', color: 'text-blue-400', linkText: 'aistudio.google.com', linkUrl: 'https://aistudio.google.com/apikey' },
  { id: 'xai', name: 'xAI (Grok)', color: 'text-white', linkText: 'console.x.ai', linkUrl: 'https://console.x.ai' },
  { id: 'deepseek', name: 'DeepSeek', color: 'text-cyan-400', linkText: 'platform.deepseek.com', linkUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'replicate', name: 'Replicate', color: 'text-purple-400', linkText: 'replicate.com', linkUrl: 'https://replicate.com/account/api-tokens' },
] as const;

// ─── Tab Components ──────────────────────────────────────────────────────────

function NicheTab() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    niche: '',
    pillars: [] as string[],
    audience: '',
    tone: '',
    competitors: [] as { handle: string; platform: string }[],
    antiTopics: [] as string[],
  });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch('/api/settings/niche', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
          setForm({
            niche: data.profile.niche || '',
            pillars: data.profile.pillars || [],
            audience: data.profile.audience || '',
            tone: data.profile.tone || '',
            competitors: data.profile.competitors || [],
            antiTopics: data.profile.antiTopics || [],
          });
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const token = await getToken();
    const resetWeights = profile && form.niche !== (profile as any).niche;
    const res = await fetch('/api/settings/niche', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, resetWeights }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data.profile);
    }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[13px] text-text-muted">Primary Niche</label>
        <input
          value={form.niche}
          onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] text-text-muted">Content Pillars (comma-separated)</label>
        <input
          value={form.pillars.join(', ')}
          onChange={(e) => setForm((f) => ({ ...f, pillars: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] text-text-muted">Target Audience</label>
        <textarea
          value={form.audience}
          onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-[13px] text-text-muted">Tone</label>
        <select
          value={form.tone}
          onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
          className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        >
          {['professional', 'casual', 'authoritative', 'friendly', 'provocative', 'educational'].map((t) => (
            <option key={t} value={t} className="bg-[#111125]">{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[13px] text-text-muted">Anti-Topics (comma-separated)</label>
        <input
          value={form.antiTopics.join(', ')}
          onChange={(e) => setForm((f) => ({ ...f, antiTopics: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-accent/20 px-5 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

function AiKeysTab() {
  const [keys, setKeys] = useState<AiKeyEntry[]>([]);
  const [resolvedProviders, setResolvedProviders] = useState<ResolvedProvider[]>([]);
  const [config, setConfig] = useState<Record<string, ModelSlot | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const [keysRes, configRes] = await Promise.all([
        fetch('/api/settings/ai-keys', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/settings/model-config', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (keysRes.ok) {
        const data = await keysRes.json();
        setKeys(data.keys || []);
        setResolvedProviders(data.resolvedProviders || []);
      }
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.config);
      }
      setLoading(false);
    })();
  }, []);

  const handleAddKey = async (provider: string) => {
    if (!newKeyValue.trim()) return;
    setValidating(true);
    const token = await getToken();
    const res = await fetch('/api/settings/ai-keys', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', provider, apiKey: newKeyValue }),
    });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
      setResolvedProviders(data.resolvedProviders || []);
      setAddingProvider(null);
      setNewKeyValue('');
    } else {
      const err = await res.json();
      alert(err.error || 'Validation failed');
    }
    setValidating(false);
  };

  const handleRemove = async (provider: string) => {
    if (!confirm(`Remove ${provider} key? Model slots using this provider will be cleared.`)) return;
    const token = await getToken();
    const res = await fetch('/api/settings/ai-keys', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', provider }),
    });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
      setResolvedProviders(data.resolvedProviders || []);
    }
  };

  const handleRevalidate = async (provider: string) => {
    const token = await getToken();
    const res = await fetch('/api/settings/ai-keys', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revalidate', provider }),
    });
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
      setResolvedProviders(data.resolvedProviders || []);
    } else {
      const err = await res.json();
      alert(err.error || 'Re-validation failed');
    }
  };

  const handleModelSlotChange = async (slot: string, value: ModelSlot | null) => {
    const token = await getToken();
    const res = await fetch('/api/settings/model-config', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [slot]: value }),
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
    }
  };

  if (loading) return <LoadingSpinner />;

  const connectedProviders = new Set(
    resolvedProviders
      .filter((provider) => provider.status === 'available')
      .map((provider) => provider.provider),
  );

  return (
    <div className="space-y-6">
      {/* Provider Cards */}
      <GlassCard className="p-4">
        <h3 className="mb-4 text-sm font-semibold text-white">AI Providers</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((prov) => {
            const key = keys.find(k => k.provider === prov.id);
            const resolved = resolvedProviders.find((provider) => provider.provider === prov.id);
            const caps = key?.capabilities as { models?: string[]; image_gen?: boolean; web_search?: boolean; x_search?: boolean } | undefined;
            const modelList = Array.isArray(caps?.models)
              ? caps.models
              : resolved?.models || [];
            const sourceLabel =
              resolved?.status === 'unavailable'
                ? 'Unavailable'
                : resolved?.source === 'user'
                  ? 'User key'
                  : 'Platform key';

            return (
              <div key={prov.id} className="rounded-lg border border-white/6 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${prov.color}`}>{prov.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      resolved?.status === 'unavailable'
                        ? 'bg-red-500/10 text-red-300'
                        : resolved?.source === 'user'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {sourceLabel}
                  </span>
                </div>

                {resolved?.status === 'available' ? (
                  <div className="mt-2 space-y-2">
                    {modelList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {modelList.slice(0, 4).map(m => (
                          <span key={m} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-text-muted">{m}</span>
                        ))}
                        {modelList.length > 4 && (
                          <span className="text-[10px] text-text-muted/50">+{modelList.length - 4} more</span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {resolved?.capabilities.image_gen && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">Image Gen</span>}
                      {resolved?.capabilities.web_search && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">Web Search</span>}
                      {resolved?.capabilities.x_search && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">X Search</span>}
                    </div>
                    {key?.validatedAt && (
                      <p className="text-[10px] text-text-muted/40">
                        Validated: {new Date(key.validatedAt).toLocaleDateString()}
                      </p>
                    )}
                    {key ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleRevalidate(prov.id)}
                          className="rounded bg-white/5 px-2 py-1 text-[11px] text-text-muted hover:bg-white/10"
                        >
                          Re-validate
                        </button>
                        <button
                          onClick={() => handleRemove(prov.id)}
                          className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-text-muted/50">
                        Using platform default key. Add your own key to override it.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-2">
                    {addingProvider === prov.id ? (
                      <div className="space-y-2">
                        <input
                          type="password"
                          value={newKeyValue}
                          onChange={(e) => setNewKeyValue(e.target.value)}
                          placeholder={`${prov.name} API Key`}
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder:text-text-muted/30 focus:border-accent/50 focus:outline-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleAddKey(prov.id)}
                            disabled={validating}
                            className="rounded bg-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/30 disabled:opacity-50"
                          >
                            {validating ? 'Validating...' : 'Add Key'}
                          </button>
                          <button
                            onClick={() => { setAddingProvider(null); setNewKeyValue(''); }}
                            className="rounded bg-white/5 px-2 py-1 text-[11px] text-text-muted hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => { setAddingProvider(prov.id); setNewKeyValue(''); }}
                          className="rounded bg-accent/20 px-2 py-1 text-[11px] text-accent hover:bg-accent/30"
                        >
                          Add Key
                        </button>
                        <a
                          href={prov.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-accent/60 hover:text-accent"
                        >
                          Get a key &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Model Slot Assignment */}
      {connectedProviders.size > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-4 text-sm font-semibold text-white">Model Assignments</h3>
          <div className="space-y-3">
            {[
              { slot: 'slotA', label: 'Discovery Slot A' },
              { slot: 'slotB', label: 'Discovery Slot B' },
              { slot: 'slotC', label: 'Discovery Slot C' },
              { slot: 'slotD', label: 'Discovery Slot D' },
              { slot: 'subAgentModel', label: 'Sub-Agent Scoring' },
              { slot: 'captionModel', label: 'Caption Generation' },
              { slot: 'imageModel', label: 'Image Generation' },
            ].map(({ slot, label }) => {
              const current = config?.[slot] as ModelSlot | null | undefined;
              return (
                <div key={slot} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-text-muted">{label}</span>
                  <select
                    value={current ? `${current.provider}:${current.model}` : ''}
                    onChange={(e) => {
                      if (!e.target.value) {
                        handleModelSlotChange(slot, null);
                      } else {
                        const [provider, model] = e.target.value.split(':');
                        handleModelSlotChange(slot, { provider, model });
                      }
                    }}
                    className="min-w-[180px] rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-[12px] text-white focus:border-accent/50 focus:outline-none"
                  >
                    <option value="" className="bg-[#111125]">Not assigned</option>
                    {resolvedProviders
                      .filter((provider) => provider.status === 'available')
                      .flatMap((provider) => {
                        const keyCaps = keys.find((entry) => entry.provider === provider.provider)?.capabilities as { models?: string[] } | undefined;
                        const models = keyCaps?.models || provider.models;
                        if (!models || models.length === 0) {
                          return [
                            <option
                              key={`${provider.provider}:default`}
                              value={`${provider.provider}:default`}
                              className="bg-[#111125]"
                            >
                              {provider.provider}
                            </option>,
                          ];
                        }

                        return models.map((modelName) => (
                          <option
                            key={`${provider.provider}:${modelName}`}
                            value={`${provider.provider}:${modelName}`}
                            className="bg-[#111125]"
                          >
                            {provider.provider} / {modelName}
                          </option>
                        ));
                      })}
                  </select>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function SocialsTab() {
  const [connections, setConnections] = useState<
    {
      platform: string;
      accountName: string | null;
      connectionHealth: string | null;
      tokenExpiresAt: string | null;
      lastHealthCheck: string | null;
      isActive: boolean;
      accountId?: string | null;
    }[]
  >([]);
  const [oauthConfig, setOauthConfig] = useState<{ linkedin: { configured: boolean; missing: string[] }; x: { configured: boolean; missing: string[] } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');
  const searchParams = useSearchParams();

  async function loadConnections() {
    const token = await getToken();
    const res = await fetch('/api/connections', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setConnections(data.connections || []);
      setOauthConfig(data.oauth || null);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await loadConnections();
    })();
  }, []);

  useEffect(() => {
    const provider = searchParams.get('linkedin') ? 'LinkedIn' : searchParams.get('x') ? 'X' : null;
    const status = searchParams.get('linkedin') || searchParams.get('x');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (provider && status === 'connected') {
      setMessage(`${provider} connected successfully.`);
      void loadConnections();
      return;
    }

    if (error) {
      setMessage(
        `Connection failed: ${decodeHtmlEntities(
          errorDescription || error.replace(/_/g, ' '),
        )}`,
      );
    }
  }, [searchParams]);

  const startConnect = async (platform: 'linkedin' | 'x') => {
    setMessage('');
    const token = await getToken();
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const response = await fetch(`/api/auth/${platform}?returnTo=${encodeURIComponent(returnTo)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok || !data.authorizeUrl) {
      setMessage(
        data.error_description ||
          data.error ||
          `Unable to start ${platform === 'linkedin' ? 'LinkedIn' : 'X'} connection.`,
      );
      return;
    }

    window.location.href = data.authorizeUrl;
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}?`)) return;
    const token = await getToken();
    await fetch('/api/settings/social/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    setConnections((prev) => prev.filter((c) => c.platform !== platform));
    setMessage(`${platform === 'linkedin' ? 'LinkedIn' : 'X'} disconnected.`);
  };

  const handleTest = async (platform: 'linkedin' | 'x') => {
    const token = await getToken();
    const response = await fetch('/api/settings/social/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ platform }),
    });
    const data = await response.json();
    setMessage(data.message || (data.ok ? 'Connection looks healthy.' : 'Connection test failed.'));
    await loadConnections();
  };

  if (loading) return <LoadingSpinner />;

  const platforms = ['linkedin', 'x'] as const;

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-text-muted">
          {message}
        </div>
      )}
      {platforms.map((p) => {
        const conn = connections.find((c) => c.platform === p);
        const healthColor = conn?.connectionHealth === 'healthy' ? 'text-green-400' : conn?.connectionHealth === 'degraded' ? 'text-yellow-400' : conn?.connectionHealth === 'expired' ? 'text-red-400' : 'text-text-muted';
        const healthDot = conn?.connectionHealth === 'healthy' ? 'bg-green-400' : conn?.connectionHealth === 'degraded' ? 'bg-yellow-400' : conn?.connectionHealth === 'expired' ? 'bg-red-400' : 'bg-white/20';
        const daysLeft = conn?.tokenExpiresAt
          ? Math.ceil((new Date(conn.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;
        const isConfigured = oauthConfig?.[p]?.configured ?? true;

        return (
          <GlassCard key={p} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-white">
                  {p === 'linkedin' ? 'LinkedIn' : 'X'}
                </span>
                {conn ? (
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${healthDot}`} />
                    <span className={`text-[12px] font-medium capitalize ${healthColor}`}>
                      {conn.connectionHealth || 'Unknown'}
                    </span>
                  </span>
                ) : (
                  <span className="text-[12px] text-text-muted/50">Not connected</span>
                )}
              </div>
              <div className="flex gap-2">
                {conn && (
                  <button
                    onClick={() => startConnect(p)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted hover:bg-white/10"
                  >
                    Reconnect
                  </button>
                )}
                {conn && (
                  <button
                    onClick={() => handleTest(p)}
                    className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-muted hover:bg-white/10"
                  >
                    Test
                  </button>
                )}
                {conn ? (
                  <button
                    onClick={() => handleDisconnect(p)}
                    className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
                  >
                    Disconnect
                  </button>
                ) : !isConfigured ? (
                  <span className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
                    OAuth not configured
                  </span>
                ) : (
                  <button
                    onClick={() => startConnect(p)}
                    className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
            {conn && (
              <div className="mt-2 space-y-1 text-[12px] text-text-muted/60">
                {conn.accountName && <p>Account: {conn.accountName}</p>}
                {daysLeft !== null && (
                  <p className={daysLeft <= 7 ? 'text-yellow-400' : ''}>
                    Token expires: {daysLeft > 0 ? `${daysLeft} days` : 'Expired'}
                  </p>
                )}
                {conn.lastHealthCheck && (
                  <p>Last check: {new Date(conn.lastHealthCheck).toLocaleString()}</p>
                )}
              </div>
            )}
            {!conn && !isConfigured && (
              <p className="mt-2 text-[12px] text-red-300">
                Missing {(oauthConfig?.[p].missing || []).map((item) => `\`${item}\``).join(', ')}.
              </p>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState('TechJMBot');
  const [codeExpiry, setCodeExpiry] = useState(0);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch('/api/settings/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPrefs(data.preferences);
      }
      setLoading(false);
    })();
  }, []);

  // Countdown timer for code
  useEffect(() => {
    if (codeExpiry <= 0) return;
    const interval = setInterval(() => {
      setCodeExpiry((prev) => {
        if (prev <= 1) {
          setLinkCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [codeExpiry]);

  const generateCode = async () => {
    const token = await getToken();
    const res = await fetch('/api/settings/telegram/generate-code', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLinkCode(data.code);
      setBotUsername(data.botUsername);
      setCodeExpiry(data.expiresIn);
    }
  };

  const sendTest = async () => {
    const token = await getToken();
    await fetch('/api/settings/telegram/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const disconnectTelegram = async () => {
    const token = await getToken();
    await fetch('/api/settings/telegram/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setPrefs((prev) => (prev ? { ...prev, telegramChatId: null, telegramEnabled: false } : null));
  };

  const togglePref = async (field: string, value: boolean) => {
    const token = await getToken();
    await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setPrefs((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const updateDigestSetting = async (field: string, value: string) => {
    const token = await getToken();
    await fetch('/api/settings/notifications', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setPrefs((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  if (loading) return <LoadingSpinner />;

  const isConnected = !!(prefs as any)?.telegramChatId;

  // Generate time options (06:00 through 22:00 in 30-min increments)
  const timeOptions: string[] = [];
  for (let h = 6; h <= 22; h++) {
    timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 22) timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
  }

  return (
    <div className="space-y-6">
      {/* Telegram Connection */}
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Telegram Connection</h3>
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm text-green-400">Connected to Telegram</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={sendTest}
                className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30"
              >
                Send Test Message
              </button>
              <button
                onClick={disconnectTelegram}
                className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-text-muted">
              1. Open <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@{botUsername}</a> in Telegram
            </p>
            <p className="text-[13px] text-text-muted">2. Generate a code below and send it to the bot</p>
            {linkCode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/10 px-4 py-2 font-mono text-2xl font-bold tracking-widest text-white">
                    {linkCode}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(`/link ${linkCode}`)}
                    className="rounded-lg bg-white/5 px-3 py-2 text-xs text-text-muted hover:bg-white/10"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[11px] text-text-muted/50">
                  Send <code>/link {linkCode}</code> to the bot. Expires in {Math.floor(codeExpiry / 60)}:{(codeExpiry % 60).toString().padStart(2, '0')}
                </p>
              </div>
            ) : (
              <button
                onClick={generateCode}
                className="rounded-lg bg-accent/20 px-4 py-2 text-sm text-accent hover:bg-accent/30"
              >
                Generate Code
              </button>
            )}
          </div>
        )}
      </GlassCard>

      {/* Notification Toggles */}
      {isConnected && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Notification Preferences</h3>
          <div className="space-y-3">
            {[
              { field: 'notifyDailyDigest', label: 'Daily Topic Digest' },
              { field: 'notifyPublishSuccess', label: 'Publish Confirmations' },
              { field: 'notifyPublishFailure', label: 'Publish Failures' },
              { field: 'notifyTokenExpiry', label: 'Token Expiry Warnings' },
              { field: 'notifyWeeklyReport', label: 'Weekly Performance Report' },
              { field: 'notifyConnectionHealth', label: 'Connection Health Alerts' },
            ].map(({ field, label }) => (
              <label key={field} className="flex items-center justify-between">
                <span className="text-[13px] text-text-muted">{label}</span>
                <button
                  onClick={() => togglePref(field, !(prefs as any)?.[field])}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    (prefs as any)?.[field] ? 'bg-accent' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      (prefs as any)?.[field] ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Digest Settings */}
      {isConnected && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Digest Settings</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-muted">Send daily digest at</span>
              <select
                value={(prefs as any)?.digestTime || '08:00'}
                onChange={(e) => updateDigestSetting('digestTime', e.target.value)}
                className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-[12px] text-white focus:border-accent/50 focus:outline-none"
              >
                {timeOptions.map(t => (
                  <option key={t} value={t} className="bg-[#111125]">{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-muted">Timezone</span>
              <select
                value={(prefs as any)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
                onChange={(e) => updateDigestSetting('timezone', e.target.value)}
                className="min-w-[180px] rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-[12px] text-white focus:border-accent/50 focus:outline-none"
              >
                {[
                  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
                  'Asia/Kolkata', 'Asia/Dubai', 'Australia/Sydney', 'Pacific/Auckland',
                ].map(tz => (
                  <option key={tz} value={tz} className="bg-[#111125]">{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function AccountTab() {
  const [user, setUser] = useState<{ email: string; name: string | null; plan: string; createdAt: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const current = auth.currentUser;
      if (current) {
        setUser({
          email: current.email || '',
          name: current.displayName,
          plan: 'free',
          createdAt: current.metadata.creationTime || null,
        });
      }
    })();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    const token = await getToken();
    const res = await fetch('/api/settings/account/export', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `techjm-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (deleteConfirm !== 'DELETE') return;
    const token = await getToken();
    const res = await fetch('/api/settings/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    if (res.ok) {
      const { getAuth, signOut } = await import('firebase/auth');
      await signOut(getAuth());
      window.location.href = '/';
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Account Info</h3>
        <div className="space-y-2 text-[13px]">
          <p className="text-text-muted">Email: <span className="text-white">{user?.email}</span></p>
          <p className="text-text-muted">Name: <span className="text-white">{user?.name || '—'}</span></p>
          <p className="text-text-muted">Plan: <span className="inline-flex rounded-md bg-accent/20 px-2 py-0.5 text-[11px] text-accent">{user?.plan}</span></p>
          {user?.createdAt && (
            <p className="text-text-muted">Joined: <span className="text-white">{new Date(user.createdAt).toLocaleDateString()}</span></p>
          )}
        </div>
      </GlassCard>

      <GlassCard className="border border-red-500/20 p-4">
        <h3 className="mb-3 text-sm font-semibold text-red-400">Danger Zone</h3>
        <div className="space-y-4">
          <div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm text-text-muted hover:bg-white/10 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export My Data'}
            </button>
          </div>
          <div className="border-t border-white/5 pt-4">
            <p className="mb-2 text-[13px] text-text-muted">
              Type <span className="font-mono text-red-400">DELETE</span> to permanently delete your account and all data.
            </p>
            <div className="flex gap-2">
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="rounded-lg border border-red-500/20 bg-transparent px-3 py-2 text-sm text-white focus:border-red-500/50 focus:outline-none"
              />
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== 'DELETE'}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400 hover:bg-red-500/30 disabled:opacity-30"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TABS: { value: SettingsTab; label: string }[] = [
  { value: 'niche', label: 'Niche' },
  { value: 'ai', label: 'AI Keys' },
  { value: 'socials', label: 'Social Platforms' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'account', label: 'Account' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('niche');

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage your niche config, AI keys, social platforms, notifications, and account
        </p>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${
              activeTab === tab.value
                ? 'bg-accent/20 font-medium text-accent'
                : 'text-text-muted hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-w-2xl">
        {activeTab === 'niche' && <NicheTab />}
        {activeTab === 'ai' && <AiKeysTab />}
        {activeTab === 'socials' && <SocialsTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  );
}
