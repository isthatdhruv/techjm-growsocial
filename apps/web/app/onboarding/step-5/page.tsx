'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { GlassCard } from '@/app/components/glass-card';

interface NicheProfile {
  niche: string;
  pillars: string[];
  audience: string;
  tone: string;
  competitors: { handle: string; platform: string }[];
  antiTopics: string[];
}

interface AIKeyInfo {
  provider: string;
  capabilities: {
    web_search: boolean;
    x_search: boolean;
    image_gen: boolean;
    models: string[];
  };
}

interface ModelConfig {
  slotA: { provider: string; model: string } | null;
  slotB: { provider: string; model: string } | null;
  slotC: { provider: string; model: string } | null;
  slotD: { provider: string; model: string } | null;
  subAgentModel: { provider: string; model: string } | null;
  captionModel: { provider: string; model: string } | null;
  imageModel: { provider: string; model: string } | null;
}

interface SocialConnection {
  platform: string;
  accountName: string | null;
}

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  xai: 'xAI (Grok)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  replicate: 'Replicate',
};

const toneLabels: Record<string, string> = {
  professional: 'Professional',
  conversational: 'Conversational',
  provocative: 'Provocative',
  educational: 'Educational',
  witty: 'Witty',
};

export default function Step5Review() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [niche, setNiche] = useState<NicheProfile | null>(null);
  const [aiKeys, setAiKeys] = useState<AIKeyInfo[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [socials, setSocials] = useState<SocialConnection[]>([]);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  // Fetch all data for review
  useEffect(() => {
    if (!user) return;
    async function fetchAll() {
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [nicheRes, keysRes, socialsRes] = await Promise.all([
          fetch('/api/onboarding/niche', { headers }),
          fetch('/api/onboarding/ai-keys', { headers }),
          fetch('/api/onboarding/socials', { headers }),
        ]);

        if (nicheRes.ok) {
          const d = await nicheRes.json();
          setNiche(d.profile);
        }
        if (keysRes.ok) {
          const d = await keysRes.json();
          setAiKeys(d.keys || []);
          setModelConfig(d.modelConfig || null);
        }
        if (socialsRes.ok) {
          const d = await socialsRes.json();
          setSocials(d.connections || []);
        }
      } catch { /* silent */ }
      setDataLoading(false);
    }
    fetchAll();
  }, [user]);

  async function handleLaunch() {
    if (!user) return;
    setLaunching(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/onboarding/launch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Launch failed');
      }

      router.push('/dashboard?welcome=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  }

  function getSlotAssignments(): { provider: string; roles: string[] }[] {
    if (!modelConfig) return [];
    const map: Record<string, string[]> = {};
    const slots: [string, { provider: string; model: string } | null][] = [
      ['Discovery Slot A', modelConfig.slotA],
      ['Discovery Slot B', modelConfig.slotB],
      ['Discovery Slot C', modelConfig.slotC],
      ['Discovery Slot D', modelConfig.slotD],
      ['Sub-Agent', modelConfig.subAgentModel],
      ['Caption', modelConfig.captionModel],
      ['Image Gen', modelConfig.imageModel],
    ];
    for (const [role, cfg] of slots) {
      if (cfg) {
        if (!map[cfg.provider]) map[cfg.provider] = [];
        map[cfg.provider].push(role);
      }
    }
    return Object.entries(map).map(([provider, roles]) => ({ provider, roles }));
  }

  if (loading || !user || dataLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-bold text-white">Review your setup</h1>
        <p className="text-sm text-text-muted">
          Everything looks good? Hit Launch to start discovering topics.
        </p>
      </div>

      {/* Card 1 — Niche & Content */}
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Niche & Content
          </h3>
          <button
            onClick={() => router.push('/onboarding/step-2')}
            className="text-xs text-accent hover:underline"
          >
            Edit
          </button>
        </div>
        {niche ? (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-white">{niche.niche}</p>
            <div className="flex flex-wrap gap-1.5">
              {niche.pillars.map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs text-accent"
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="text-sm text-text-muted">{niche.audience}</p>
            <span className="inline-block rounded-full border border-blue/30 bg-blue/10 px-3 py-0.5 text-xs font-medium text-secondary">
              {toneLabels[niche.tone] || niche.tone}
            </span>
            {niche.competitors.length > 0 && (
              <div className="text-xs text-text-muted/60">
                Tracking: {niche.competitors.map((c) => `@${c.handle}`).join(', ')}
              </div>
            )}
            {niche.antiTopics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-text-muted/60">Avoiding:</span>
                {niche.antiTopics.map((t) => (
                  <span key={t} className="rounded bg-error/10 px-1.5 py-0.5 text-[10px] text-error/70">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-error">Niche not configured</p>
        )}
      </GlassCard>

      {/* Card 2 — AI Providers */}
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            AI Providers
          </h3>
          <button
            onClick={() => router.push('/onboarding/step-3')}
            className="text-xs text-accent hover:underline"
          >
            Edit
          </button>
        </div>
        {aiKeys.length > 0 ? (
          <div className="space-y-3">
            {aiKeys.map((k) => {
              const assignments = getSlotAssignments().find(
                (a) => a.provider === k.provider,
              );
              return (
                <div key={k.provider} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {providerLabels[k.provider] || k.provider}
                    </span>
                    <div className="flex gap-1">
                      {k.capabilities.web_search && (
                        <span className="rounded bg-blue/15 px-1.5 py-0.5 text-[10px] text-secondary">
                          Web
                        </span>
                      )}
                      {k.capabilities.x_search && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                          X
                        </span>
                      )}
                      {k.capabilities.image_gen && (
                        <span className="rounded bg-tertiary/15 px-1.5 py-0.5 text-[10px] text-tertiary">
                          Image
                        </span>
                      )}
                    </div>
                  </div>
                  {assignments && (
                    <span className="text-xs text-text-muted/60">
                      {assignments.roles.join(', ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-error">No AI providers configured</p>
        )}
      </GlassCard>

      {/* Card 3 — Social Platforms */}
      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Social Platforms
          </h3>
          <button
            onClick={() => router.push('/onboarding/step-4')}
            className="text-xs text-accent hover:underline"
          >
            Edit
          </button>
        </div>
        {socials.length > 0 ? (
          <div className="space-y-2">
            {socials.map((s) => (
              <div key={s.platform} className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-tertiary" />
                <span className="text-sm text-white capitalize">{s.platform}</span>
                <span className="text-xs text-text-muted">— {s.accountName}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No platforms connected (you can add them later)</p>
        )}
      </GlassCard>

      {/* Card 4 — What happens next */}
      <GlassCard className="p-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-text-muted">
          What happens next
        </h3>
        <p className="mb-3 text-sm text-text-muted">When you hit Launch:</p>
        <ol className="space-y-2 text-sm text-text-muted">
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">1.</span>
            We&apos;ll search the web using 4 AI models to find trending topics in your niche
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">2.</span>
            Each topic gets analyzed by 7 specialized agents
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">3.</span>
            You&apos;ll see scored topics in your dashboard in about 60-90 seconds
          </li>
          <li className="flex gap-2">
            <span className="shrink-0 text-accent">4.</span>
            Pick the best ones, we&apos;ll generate captions and images
          </li>
        </ol>
      </GlassCard>

      {/* Launch button */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <button
          onClick={handleLaunch}
          disabled={launching || !niche || aiKeys.length === 0}
          className="rounded-2xl bg-accent px-12 py-4 text-lg font-bold text-white shadow-lg transition-all hover:bg-accent-hover hover:shadow-xl glow-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {launching ? (
            <span className="flex items-center gap-2">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Setting up your AI pipeline...
            </span>
          ) : (
            'Launch'
          )}
        </button>

        <button
          onClick={() => router.push('/onboarding/step-4')}
          className="text-sm text-text-muted hover:text-white"
        >
          Back to Step 4
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-error/10 px-4 py-2.5 text-center text-sm text-error">
          {error}
        </div>
      )}
    </div>
  );
}
