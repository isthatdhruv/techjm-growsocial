'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useOnboardingStore, type ValidatedProvider, type ModelSlotConfig } from '@/stores/onboarding-store';
import { GlassCard } from '@/app/components/glass-card';
import { ProviderKeyInput } from '@/app/components/onboarding/provider-key-input';
import { ModelSlotSelector } from '@/app/components/onboarding/model-slot-selector';

const ALL_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'mistral',
  'replicate',
  'groq',
  'openai_compatible',
] as const;

interface Recommendation {
  niche: string;
  slotAProvider: string;
  slotAModel: string;
  slotBProvider: string;
  slotBModel: string;
  slotCProvider: string;
  slotCModel: string;
  slotDProvider: string;
  slotDModel: string;
  subAgentProvider: string;
  subAgentModel: string;
  captionProvider: string;
  captionModel: string;
  imageProvider: string;
  imageModel: string;
  reasoning: string;
  estCostLow: string;
  estCostHigh: string;
}

interface Caps {
  web_search: boolean;
  x_search: boolean;
  image_gen: boolean;
  available_models: string[];
}

interface ResolvedProviderStatus {
  provider: string;
  source: 'user' | 'env';
  status: 'available' | 'unavailable';
  providerLabel?: string | null;
  models: string[];
  capabilities: {
    web_search: boolean;
    x_search: boolean;
    image_gen: boolean;
  };
}

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  xai: 'xAI (Grok)',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  replicate: 'Replicate',
  groq: 'Groq',
  openai_compatible: 'OpenAI-Compatible',
};

export default function Step3AIKeys() {
  const { user, loading, setOnboardingStep } = useAuth();
  const router = useRouter();
  const { nicheData, setAIKeysData } = useOnboardingStore();

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<Record<string, Caps | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [recommendedProviders, setRecommendedProviders] = useState<Set<string>>(new Set());
  const [resolvedProviders, setResolvedProviders] = useState<ResolvedProviderStatus[]>([]);

  const [modelConfig, setModelConfig] = useState<{
    slotA: ModelSlotConfig | null;
    slotB: ModelSlotConfig | null;
    slotC: ModelSlotConfig | null;
    slotD: ModelSlotConfig | null;
    subAgentModel: ModelSlotConfig | null;
    captionModel: ModelSlotConfig | null;
    imageModel: ModelSlotConfig | null;
  }>({
    slotA: null, slotB: null, slotC: null, slotD: null,
    subAgentModel: null, captionModel: null, imageModel: null,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch recommendation
  useEffect(() => {
    if (!user || !nicheData?.niche) return;
    async function fetchRec() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/onboarding/recommendations?niche=${encodeURIComponent(nicheData!.niche)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setRecommendation(data.recommendation);
          // Extract recommended providers
          const rec = data.recommendation as Recommendation;
          const provs = new Set([
            rec.slotAProvider, rec.slotBProvider, rec.slotCProvider, rec.slotDProvider,
            rec.subAgentProvider, rec.captionProvider, rec.imageProvider,
          ]);
          setRecommendedProviders(provs);
        }
      } catch { /* silent */ }
    }
    fetchRec();
  }, [user, nicheData]);

  useEffect(() => {
    if (!user) return;

    async function fetchResolvedProviders() {
      try {
        const token = await user?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/onboarding/ai-keys', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        setResolvedProviders(data.resolvedProviders || []);
        if (data.modelConfig) {
          setModelConfig({
            slotA: data.modelConfig.slotA,
            slotB: data.modelConfig.slotB,
            slotC: data.modelConfig.slotC,
            slotD: data.modelConfig.slotD,
            subAgentModel: data.modelConfig.subAgentModel,
            captionModel: data.modelConfig.captionModel,
            imageModel: data.modelConfig.imageModel,
          });
        }
      } catch {
        // Non-blocking
      }
    }

    fetchResolvedProviders();
  }, [user]);

  const validatedProviders: ValidatedProvider[] = ALL_PROVIDERS
    .filter((p) => capabilities[p]?.available_models)
    .map((p) => ({
      provider: p,
      baseUrl: baseUrls[p],
      capabilities: capabilities[p]!,
    }));

  const availableProvidersForConfig: ValidatedProvider[] = resolvedProviders
    .filter((provider) => provider.status === 'available')
    .map((provider) => ({
      provider: provider.provider as ValidatedProvider['provider'],
      baseUrl: provider.provider === 'openai_compatible' ? baseUrls[provider.provider] : undefined,
      capabilities: {
        web_search: provider.capabilities.web_search,
        x_search: provider.capabilities.x_search,
        image_gen: provider.capabilities.image_gen,
        available_models: provider.models,
      },
    }));

  const allModels = availableProvidersForConfig.flatMap((vp) =>
    vp.capabilities.available_models.map((m) => ({ provider: vp.provider, model: m })),
  );

  const handleValidate = useCallback(
    async (provider: string) => {
      if (!user || !apiKeys[provider]) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/onboarding/validate-key', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            provider,
            apiKey: apiKeys[provider],
            ...(baseUrls[provider] ? { baseUrl: baseUrls[provider] } : {}),
          }),
        });

        const data = await res.json();
        if (res.ok && data.capabilities?.valid) {
          setCapabilities((prev) => ({ ...prev, [provider]: data.capabilities }));
          setErrors((prev) => ({ ...prev, [provider]: null }));
        } else {
          setCapabilities((prev) => ({ ...prev, [provider]: null }));
          setErrors((prev) => ({
            ...prev,
            [provider]: data.capabilities?.error || data.error || 'Invalid key',
          }));
        }
      } catch {
        setErrors((prev) => ({ ...prev, [provider]: 'Validation failed' }));
      }
    },
    [user, apiKeys, baseUrls],
  );

  function applyRecommendation() {
    if (!recommendation) return;
    setModelConfig({
      slotA: { provider: recommendation.slotAProvider, model: recommendation.slotAModel },
      slotB: { provider: recommendation.slotBProvider, model: recommendation.slotBModel },
      slotC: { provider: recommendation.slotCProvider, model: recommendation.slotCModel },
      slotD: { provider: recommendation.slotDProvider, model: recommendation.slotDModel },
      subAgentModel: { provider: recommendation.subAgentProvider, model: recommendation.subAgentModel },
      captionModel: { provider: recommendation.captionProvider, model: recommendation.captionModel },
      imageModel: { provider: recommendation.imageProvider, model: recommendation.imageModel },
    });
    // Scroll to providers
    document.getElementById('provider-keys')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError('');

    try {
      const token = await user.getIdToken();

      const keysPayload = validatedProviders.map((vp) => ({
        provider: vp.provider,
        apiKey: apiKeys[vp.provider],
        ...(vp.baseUrl ? { baseUrl: vp.baseUrl } : {}),
        capabilities: {
          web_search: vp.capabilities.web_search,
          x_search: vp.capabilities.x_search,
          image_gen: vp.capabilities.image_gen,
          models: vp.capabilities.available_models,
        },
      }));

      const res = await fetch('/api/onboarding/ai-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keys: keysPayload, modelConfig }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setAIKeysData({ validatedProviders: availableProvidersForConfig, modelConfig });
      setOnboardingStep('4');
      router.push('/onboarding/step-4');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const hasWebSearchProvider = availableProvidersForConfig.some((p) =>
    ['openai', 'anthropic', 'google', 'xai'].includes(p.provider),
  );

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A — Recommendation Card */}
      {recommendation && (
        <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-blue/5 p-6">
          <h2 className="mb-1 text-lg font-bold text-white">
            Recommended AI setup for {nicheData?.niche || 'your niche'}
          </h2>
          <p className="mb-4 text-sm text-text-muted">{recommendation.reasoning}</p>

          <div className="mb-4 grid grid-cols-4 gap-3">
            {[
              { label: 'Slot A', provider: recommendation.slotAProvider, model: recommendation.slotAModel },
              { label: 'Slot B', provider: recommendation.slotBProvider, model: recommendation.slotBModel },
              { label: 'Slot C', provider: recommendation.slotCProvider, model: recommendation.slotCModel },
              { label: 'Slot D', provider: recommendation.slotDProvider, model: recommendation.slotDModel },
            ].map((slot) => (
              <div key={slot.label} className="rounded-lg bg-white/5 p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  {slot.label}
                </p>
                <p className="mt-1 text-xs font-medium text-white">
                  {providerLabels[slot.provider] || slot.provider}
                </p>
                <p className="text-[10px] text-text-muted">{slot.model}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Est. ${recommendation.estCostLow}-${recommendation.estCostHigh}/month
            </span>
            <button
              onClick={applyRecommendation}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-hover"
            >
              Use this setup
            </button>
          </div>
        </div>
      )}

      {/* Section B — Provider Key Inputs */}
      <GlassCard className="p-6" id="provider-keys">
        <h2 className="mb-1 text-lg font-bold text-white">API Provider Keys</h2>
        <p className="mb-4 text-sm text-text-muted">
          API keys are optional. If you skip them, the app will use any platform keys configured on the server.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ALL_PROVIDERS.map((provider) => (
            <ProviderKeyInput
              key={provider}
              provider={provider}
              recommended={recommendedProviders.has(provider)}
              apiKey={apiKeys[provider] || ''}
              onApiKeyChange={(key) => setApiKeys((prev) => ({ ...prev, [provider]: key }))}
              baseUrl={baseUrls[provider] || ''}
              onBaseUrlChange={(baseUrl) => setBaseUrls((prev) => ({ ...prev, [provider]: baseUrl }))}
              onValidate={() => handleValidate(provider)}
              capabilities={capabilities[provider] || null}
              error={errors[provider] || null}
            />
          ))}
        </div>
      </GlassCard>

      {/* Section C — Model Slot Assignment */}
      {availableProvidersForConfig.length > 0 && (
        <GlassCard className="p-6">
          <h2 className="mb-1 text-lg font-bold text-white">Model Assignments</h2>
          <p className="mb-4 text-sm text-text-muted">
            Assign models to each task. Auto-assigned from recommendation or leave as auto.
          </p>
          <div className="space-y-2">
            {(['slotA', 'slotB', 'slotC', 'slotD', 'subAgentModel', 'captionModel', 'imageModel'] as const).map(
              (slot) => (
                <ModelSlotSelector
                  key={slot}
                  slotName={slot}
                  availableModels={allModels}
                  selectedModel={modelConfig[slot]}
                  onChange={(model) => setModelConfig((prev) => ({ ...prev, [slot]: model }))}
                />
              ),
            )}
          </div>
        </GlassCard>
      )}

      {/* Section D — Fallback notice */}
      {availableProvidersForConfig.some((p) => ['deepseek', 'mistral'].includes(p.provider)) && (
        <div className="rounded-xl border border-blue/20 bg-blue/5 px-4 py-3 text-sm text-secondary">
          <strong>Note:</strong> DeepSeek/Mistral don&apos;t have web search. We&apos;ll automatically
          feed them real-time data from Hacker News, Reddit, and RSS feeds.
        </div>
      )}

      {/* Warnings */}
      {availableProvidersForConfig.length > 0 && !hasWebSearchProvider && (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-300">
          You have no web-search-capable provider. Discovery will use cached data only.
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/onboarding/step-2')}
          className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-text-muted hover:border-white/20 hover:text-white"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-hover glow-accent-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>

      {availableProvidersForConfig.length === 0 && (
        <p className="text-center text-xs text-text-muted/50">
          No providers are available yet. You can still continue and add keys later, but AI features will stay unavailable until a user or platform key exists.
        </p>
      )}

      {error && (
        <div className="rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">{error}</div>
      )}
    </div>
  );
}
