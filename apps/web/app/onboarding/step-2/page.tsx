'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStore, type CompetitorEntry } from '@/stores/onboarding-store';
import { GlassCard } from '@/app/components/glass-card';
import { ChipSelect } from '@/app/components/onboarding/chip-select';
import { TagInput } from '@/app/components/onboarding/tag-input';

const NICHE_OPTIONS = [
  'SaaS / Software',
  'AI / Machine Learning',
  'Marketing / Growth',
  'Fintech / Finance',
  'E-commerce / DTC',
  'Health / Wellness',
  'Creator / Personal Brand',
  'DevOps / Cloud',
  'Legal / Compliance',
  'Custom',
];

const PILLAR_MAP: Record<string, string[]> = {
  'SaaS / Software': ['Product-led growth', 'API design', 'Pricing strategy', 'Churn reduction', 'Developer tools', 'Developer experience'],
  'AI / Machine Learning': ['LLM applications', 'MLOps', 'AI agents', 'Fine-tuning', 'RAG', 'AI ethics'],
  'Marketing / Growth': ['Content marketing', 'SEO', 'Demand gen', 'PLG', 'Community growth', 'ABM'],
  'Fintech / Finance': ['Payments infra', 'Neobanking', 'Compliance/RegTech', 'Crypto/DeFi', 'Embedded finance'],
  'E-commerce / DTC': ['Conversion optimization', 'DTC brands', 'Shopify ecosystem', 'Supply chain', 'Customer retention'],
  'Health / Wellness': ['Digital health', 'Telemedicine', 'Health AI', 'Wellness tech', 'Medical devices'],
  'Creator / Personal Brand': ['Content strategy', 'Audience growth', 'Monetization', 'Brand deals', 'Platform algorithms'],
  'DevOps / Cloud': ['CI/CD', 'Kubernetes', 'Observability', 'IaC', 'Platform engineering', 'Cost optimization'],
  'Legal / Compliance': ['LegalTech', 'Compliance automation', 'Contract AI', 'RegTech', 'Privacy/GDPR'],
};

const AUDIENCE_SUGGESTIONS: Record<string, string[]> = {
  'SaaS / Software': ['CTOs', 'SaaS founders', 'Product managers', 'Engineering managers'],
  'AI / Machine Learning': ['ML engineers', 'AI researchers', 'Tech leads', 'Data scientists'],
  'Marketing / Growth': ['CMOs', 'Growth hackers', 'Content marketers', 'Startup founders'],
  'Fintech / Finance': ['Fintech founders', 'CFOs', 'Banking executives', 'Crypto builders'],
  'E-commerce / DTC': ['E-commerce founders', 'Brand managers', 'Shopify merchants', 'D2C operators'],
  'Health / Wellness': ['Health tech founders', 'Clinicians', 'Digital health investors', 'Wellness entrepreneurs'],
  'Creator / Personal Brand': ['Creators', 'Influencers', 'Personal brand builders', 'Solopreneurs'],
  'DevOps / Cloud': ['DevOps engineers', 'Platform engineers', 'SREs', 'Cloud architects'],
  'Legal / Compliance': ['Legal tech founders', 'GCs', 'Compliance officers', 'Legal ops'],
};

const TONE_OPTIONS = [
  {
    value: 'professional',
    label: 'Professional',
    desc: 'Formal, data-driven, LinkedIn-native',
    preview: 'Our analysis of 500 SaaS companies reveals...',
  },
  {
    value: 'conversational',
    label: 'Conversational',
    desc: 'Casual, relatable, like talking to a friend',
    preview: "So I just spent 3 weeks rebuilding our API and here's what I learned...",
  },
  {
    value: 'provocative',
    label: 'Provocative',
    desc: 'Bold takes, challenges conventional wisdom',
    preview: 'Unpopular opinion: your pricing page is losing you 40% of signups...',
  },
  {
    value: 'educational',
    label: 'Educational',
    desc: 'Teaches something, step-by-step breakdowns',
    preview: 'Thread: 7 things I wish I knew about API rate limiting',
  },
  {
    value: 'witty',
    label: 'Witty',
    desc: 'Clever, humor-laced, personality-forward',
    preview: 'My code works in production. I am suspicious.',
  },
];

const ANTI_TOPIC_SUGGESTIONS = ['politics', 'religion', 'competitors by name'];

export default function Step2Niche() {
  const { user, loading, setOnboardingStep } = useAuth();
  const router = useRouter();
  const { nicheData, setNicheData } = useOnboardingStore();

  const [niche, setNiche] = useState(nicheData?.niche || '');
  const [customNiche, setCustomNiche] = useState('');
  const [pillars, setPillars] = useState<string[]>(nicheData?.pillars || []);
  const [audience, setAudience] = useState(nicheData?.audience || '');
  const [tone, setTone] = useState(nicheData?.tone || '');
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>(
    nicheData?.competitors || [{ platform: 'linkedin', handle: '' }],
  );
  const [antiTopics, setAntiTopics] = useState<string[]>(nicheData?.antiTopics || []);
  const [examplePosts, setExamplePosts] = useState<string[]>(nicheData?.examplePosts || ['', '', '']);
  const [showExamples, setShowExamples] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  // Load existing niche data from DB
  useEffect(() => {
    if (!user || loadedFromDb) return;
    async function loadNiche() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch('/api/onboarding/niche', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profile) {
            const p = data.profile;
            setNiche(p.niche);
            setPillars(p.pillars as string[]);
            setAudience(p.audience);
            setTone(p.tone);
            if (p.competitors && (p.competitors as CompetitorEntry[]).length > 0) {
              setCompetitors(p.competitors as CompetitorEntry[]);
            }
            if (p.antiTopics) setAntiTopics(p.antiTopics as string[]);
            if (p.examplePosts && (p.examplePosts as string[]).length > 0) {
              setExamplePosts(p.examplePosts as string[]);
              setShowExamples(true);
            }
          }
        }
      } catch {
        // Silently fail — user will fill from scratch
      }
      setLoadedFromDb(true);
    }
    loadNiche();
  }, [user, loadedFromDb]);

  const effectiveNiche = niche === 'Custom' ? customNiche : niche;
  const pillarOptions = PILLAR_MAP[niche] || [];
  const audienceSuggestions = AUDIENCE_SUGGESTIONS[niche] || [];

  const canSubmit =
    effectiveNiche.length > 0 && pillars.length >= 3 && audience.length > 0 && tone.length > 0;

  async function handleSave() {
    if (!canSubmit || !user) return;
    setSaving(true);
    setError('');

    const formData = {
      niche: effectiveNiche,
      pillars,
      audience,
      tone,
      competitors: competitors.filter((c) => c.handle.trim()),
      antiTopics,
      examplePosts: examplePosts.filter((p) => p.trim()),
    };

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/onboarding/niche', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setNicheData(formData);
      setOnboardingStep('3');
      router.push('/onboarding/step-3');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A — Niche */}
      <GlassCard className="p-6">
        <h2 className="mb-1 text-lg font-bold text-white">What&apos;s your niche?</h2>
        <p className="mb-4 text-sm text-text-muted">
          This drives the entire AI pipeline — topic discovery, analysis, and content generation.
        </p>
        <select
          value={niche}
          onChange={(e) => {
            setNiche(e.target.value);
            setPillars([]);
          }}
          className="w-full rounded-xl border border-white/10 bg-surface-mid px-4 py-3 text-sm text-white focus:border-accent/40 focus:outline-none"
        >
          <option value="">Select your niche...</option>
          {NICHE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {niche === 'Custom' && (
          <input
            type="text"
            value={customNiche}
            onChange={(e) => setCustomNiche(e.target.value)}
            placeholder="Describe your niche..."
            className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/40 focus:outline-none"
          />
        )}
      </GlassCard>

      {/* Section B — Content Pillars */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">Choose your content pillars</h2>
          <p className="mb-4 text-sm text-text-muted">
            Select 3-6 pillars that define your content strategy.
          </p>
          <ChipSelect
            options={pillarOptions}
            selected={pillars}
            onChange={setPillars}
            min={3}
            max={6}
            allowCustom
            label={`${pillars.length}/6 selected (min 3)`}
          />
        </GlassCard>
      )}

      {/* Section C — Audience */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">Who&apos;s your audience?</h2>
          <p className="mb-4 text-sm text-text-muted">
            Describe the people you want to reach with your content.
          </p>
          <textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g., CTOs and engineering managers at Series A-C startups"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-text-muted/40 focus:border-accent/40 focus:outline-none"
          />
          {audienceSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {audienceSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const separator = audience.trim() ? ', ' : '';
                    if (!audience.includes(s)) {
                      setAudience(audience.trim() + separator + s);
                    }
                  }}
                  className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-text-muted hover:border-white/20 hover:text-white"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Section D — Tone */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">What&apos;s your tone?</h2>
          <p className="mb-4 text-sm text-text-muted">Choose how your content should sound.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  tone === t.value
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-white/8 bg-white/3 hover:border-white/15'
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    tone === t.value ? 'text-accent' : 'text-white'
                  }`}
                >
                  {t.label}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">{t.desc}</p>
                <p className="mt-2 text-xs italic text-text-muted/60">&quot;{t.preview}&quot;</p>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Section E — Competitors */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">Competitor accounts to track</h2>
          <p className="mb-4 text-sm text-text-muted">
            We&apos;ll monitor what they post and find gaps you can fill. (Optional)
          </p>
          <div className="space-y-2">
            {competitors.map((comp, i) => (
              <div key={i} className="flex gap-2">
                <select
                  value={comp.platform}
                  onChange={(e) => {
                    const updated = [...competitors];
                    updated[i] = { ...updated[i], platform: e.target.value as 'linkedin' | 'x' };
                    setCompetitors(updated);
                  }}
                  className="w-28 rounded-lg border border-white/10 bg-surface-mid px-2 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="x">X</option>
                </select>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted/40">
                    @
                  </span>
                  <input
                    type="text"
                    value={comp.handle}
                    onChange={(e) => {
                      const updated = [...competitors];
                      updated[i] = { ...updated[i], handle: e.target.value.replace('@', '') };
                      setCompetitors(updated);
                    }}
                    placeholder="handle"
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-7 pr-3 text-sm text-white placeholder:text-text-muted/30 focus:border-accent/40 focus:outline-none"
                  />
                </div>
                {competitors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCompetitors(competitors.filter((_, idx) => idx !== i))}
                    className="px-2 text-text-muted/40 hover:text-error"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          {competitors.length < 5 && (
            <button
              type="button"
              onClick={() =>
                setCompetitors([...competitors, { platform: 'linkedin', handle: '' }])
              }
              className="mt-2 text-xs text-accent hover:underline"
            >
              + Add another
            </button>
          )}
        </GlassCard>
      )}

      {/* Section F — Anti-topics */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">Topics to avoid</h2>
          <p className="mb-4 text-sm text-text-muted">
            The AI will never suggest topics related to these. (Optional)
          </p>
          <TagInput
            tags={antiTopics}
            onChange={setAntiTopics}
            placeholder="Type a topic and press Enter..."
            suggestions={ANTI_TOPIC_SUGGESTIONS}
          />
        </GlassCard>
      )}

      {/* Section G — Example Posts */}
      {effectiveNiche && (
        <GlassCard className="p-6">
          <button
            type="button"
            onClick={() => setShowExamples(!showExamples)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-text-muted">
              Add example posts for better style matching (optional)
            </span>
            <svg
              className={`h-4 w-4 text-text-muted transition-transform ${showExamples ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showExamples && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-text-muted/60">
                Paste 2-3 of your best LinkedIn or X posts. The AI will match your writing style.
              </p>
              {examplePosts.map((post, i) => (
                <textarea
                  key={i}
                  value={post}
                  onChange={(e) => {
                    const updated = [...examplePosts];
                    updated[i] = e.target.value;
                    setExamplePosts(updated);
                  }}
                  placeholder={`Example post ${i + 1}...`}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-text-muted/30 focus:border-accent/40 focus:outline-none"
                />
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/onboarding/step-1')}
          className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-text-muted hover:border-white/20 hover:text-white"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={!canSubmit || saving}
          className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover glow-accent-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">{error}</div>
      )}
    </div>
  );
}
