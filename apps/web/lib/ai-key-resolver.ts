import {
  getAvailableAiProviders,
  getActiveApiKey,
  type ProviderConfig,
  type SupportedAIProvider,
} from '@techjm/db';

export const ALL_SUPPORTED_PROVIDERS: SupportedAIProvider[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'mistral',
  'replicate',
  'groq',
  'openai_compatible',
];

export type ResolvedProviderKey = ProviderConfig & {
  status: 'available' | 'unavailable';
};

export async function getResolvedProviderKeys(
  userId: string,
): Promise<ResolvedProviderKey[]> {
  const available = await getAvailableAiProviders(userId);
  const byProvider = new Map(
    available.map((provider) => [provider.provider, provider] as const),
  );

  return ALL_SUPPORTED_PROVIDERS.map((provider) => {
    const resolved = byProvider.get(provider);
    if (resolved) {
      return {
        ...resolved,
        status: 'available' as const,
      };
    }

    return {
      provider,
      apiKey: '',
      source: 'env',
      baseUrl: null,
      providerLabel: provider,
      models: [],
      capabilities: {
        web_search: false,
        x_search: false,
        image_gen: false,
      },
      status: 'unavailable' as const,
    };
  });
}

export async function getResolvedKeyForProvider(
  userId: string,
  provider: SupportedAIProvider,
): Promise<ProviderConfig | null> {
  try {
    return await getActiveApiKey(userId, provider);
  } catch {
    return null;
  }
}

export async function getAvailableProvidersForUser(
  userId: string,
): Promise<ProviderConfig[]> {
  const resolved = await getResolvedProviderKeys(userId);
  return resolved.filter(
    (provider): provider is ProviderConfig & { status: 'available' } =>
      provider.status === 'available',
  );
}
