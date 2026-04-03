import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetAvailableAiProviders,
  mockGetActiveApiKey,
} = vi.hoisted(() => ({
  mockGetAvailableAiProviders: vi.fn(),
  mockGetActiveApiKey: vi.fn(),
}));

vi.mock('@techjm/db', () => ({
  getAvailableAiProviders: mockGetAvailableAiProviders,
  getActiveApiKey: mockGetActiveApiKey,
}));

import {
  getAvailableProvidersForUser,
  getResolvedKeyForProvider,
  getResolvedProviderKeys,
} from '../ai-key-resolver';

describe('ai-key-resolver', () => {
  beforeEach(() => {
    mockGetAvailableAiProviders.mockReset();
    mockGetActiveApiKey.mockReset();
  });

  it('returns resolved providers with unavailable entries filled in', async () => {
    mockGetAvailableAiProviders.mockResolvedValue([
      {
        provider: 'openai',
        apiKey: 'user-key',
        source: 'user',
        baseUrl: null,
        providerLabel: 'OpenAI',
        models: ['gpt-4o-mini'],
        capabilities: { web_search: true, x_search: false, image_gen: true },
      },
    ]);

    const results = await getResolvedProviderKeys('user-1');
    expect(results.find((provider) => provider.provider === 'openai')?.source).toBe('user');
    expect(results.find((provider) => provider.provider === 'anthropic')?.status).toBe('unavailable');
  });

  it('returns null when a provider has no resolved key', async () => {
    mockGetActiveApiKey.mockRejectedValue(new Error('missing'));
    await expect(getResolvedKeyForProvider('user-1', 'google')).resolves.toBeNull();
  });

  it('filters to available providers only', async () => {
    mockGetAvailableAiProviders.mockResolvedValue([
      {
        provider: 'openai',
        apiKey: 'env-key',
        source: 'env',
        baseUrl: null,
        providerLabel: 'OpenAI',
        models: ['gpt-4o-mini'],
        capabilities: { web_search: true, x_search: false, image_gen: true },
      },
    ]);

    const results = await getAvailableProvidersForUser('user-1');
    expect(results).toHaveLength(1);
    expect(results[0].provider).toBe('openai');
  });
});
