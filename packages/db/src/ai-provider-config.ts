import { and, eq } from 'drizzle-orm';
import { db } from './client.js';
import { decryptApiKey } from './encryption.js';
import { userAiKeys } from './schema/ai-keys.js';
import { ensureDbEnvLoaded } from './env.js';

ensureDbEnvLoaded();

export type SupportedAIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'replicate'
  | 'groq'
  | 'openai_compatible';

export interface ProviderConfig {
  provider: SupportedAIProvider;
  apiKey: string;
  source: 'user' | 'env';
  baseUrl?: string | null;
  providerLabel?: string | null;
  models: string[];
  capabilities: {
    web_search: boolean;
    x_search: boolean;
    image_gen: boolean;
  };
}

const IMAGE_MODEL_PATTERN = /(image|dall-e|flux|sdxl|stable-diffusion|recraft|midjourney)/i;

const TEXT_MODEL_DEFAULTS: Record<SupportedAIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
  xai: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  replicate: 'black-forest-labs/flux-1.1-pro',
  groq: 'llama-3.3-70b-versatile',
  openai_compatible: 'gpt-4o-mini',
};

const IMAGE_MODEL_DEFAULTS: Partial<Record<SupportedAIProvider, string>> = {
  openai: 'gpt-image-1',
  replicate: 'black-forest-labs/flux-1.1-pro',
};

type RawCapabilities = Record<string, unknown> | null | undefined;

const ENV_PROVIDER_DEFAULTS: Record<
  SupportedAIProvider,
  {
    envKey?: string;
    baseUrl?: string | null;
    providerLabel: string;
    models: string[];
    capabilities: ProviderConfig['capabilities'];
  }
> = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    providerLabel: 'OpenAI',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-image-1'],
    capabilities: { web_search: true, x_search: false, image_gen: true },
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    providerLabel: 'Anthropic',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    capabilities: { web_search: true, x_search: false, image_gen: false },
  },
  google: {
    envKey: 'GOOGLE_API_KEY',
    providerLabel: 'Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    capabilities: { web_search: true, x_search: false, image_gen: false },
  },
  xai: {
    envKey: 'XAI_API_KEY',
    providerLabel: 'xAI',
    models: ['grok-2-latest', 'grok-2-mini'],
    capabilities: { web_search: true, x_search: true, image_gen: false },
  },
  deepseek: {
    envKey: 'DEEPSEEK_API_KEY',
    providerLabel: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    capabilities: { web_search: false, x_search: false, image_gen: false },
  },
  mistral: {
    envKey: 'MISTRAL_API_KEY',
    providerLabel: 'Mistral',
    models: ['mistral-large-latest'],
    capabilities: { web_search: false, x_search: false, image_gen: false },
  },
  replicate: {
    envKey: 'REPLICATE_API_KEY',
    providerLabel: 'Replicate',
    models: ['black-forest-labs/flux-1.1-pro'],
    capabilities: { web_search: false, x_search: false, image_gen: true },
  },
  groq: {
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    providerLabel: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    capabilities: { web_search: false, x_search: false, image_gen: false },
  },
  openai_compatible: {
    envKey: 'OPENAI_COMPATIBLE_API_KEY',
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || null,
    providerLabel: 'OpenAI Compatible',
    models: [process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL || 'gpt-4o-mini'],
    capabilities: { web_search: false, x_search: false, image_gen: false },
  },
};

function getCapabilitiesValue<T>(capabilities: RawCapabilities, keys: string[], fallback: T): T {
  if (!capabilities) return fallback;

  for (const key of keys) {
    if (key in capabilities) {
      return capabilities[key] as T;
    }
  }

  return fallback;
}

function fromUserRecord(
  record: typeof userAiKeys.$inferSelect,
): ProviderConfig {
  const capabilities = (record.capabilities as RawCapabilities) || {};
  const defaults = ENV_PROVIDER_DEFAULTS[record.provider as SupportedAIProvider];

  return {
    provider: record.provider as SupportedAIProvider,
    apiKey: decryptApiKey(record.apiKeyEnc),
    source: 'user',
    baseUrl: getCapabilitiesValue(capabilities, ['baseUrl', 'base_url'], defaults?.baseUrl ?? null),
    providerLabel: getCapabilitiesValue(
      capabilities,
      ['providerLabel', 'provider_label', 'displayName', 'display_name'],
      defaults?.providerLabel ?? record.provider,
    ),
    models: getCapabilitiesValue<string[]>(
      capabilities,
      ['models', 'available_models'],
      defaults?.models ?? [],
    ),
    capabilities: {
      web_search: getCapabilitiesValue(capabilities, ['web_search'], defaults?.capabilities.web_search ?? false),
      x_search: getCapabilitiesValue(capabilities, ['x_search'], defaults?.capabilities.x_search ?? false),
      image_gen: getCapabilitiesValue(capabilities, ['image_gen'], defaults?.capabilities.image_gen ?? false),
    },
  };
}

function fromEnv(provider: SupportedAIProvider): ProviderConfig | null {
  const defaults = ENV_PROVIDER_DEFAULTS[provider];
  const apiKey = defaults.envKey ? process.env[defaults.envKey] : undefined;
  if (!apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    source: 'env',
    baseUrl: defaults.baseUrl ?? null,
    providerLabel: defaults.providerLabel,
    models: defaults.models,
    capabilities: defaults.capabilities,
  };
}

export function isLikelyImageModel(model?: string | null): boolean {
  return Boolean(model && IMAGE_MODEL_PATTERN.test(model));
}

export function selectTextModel(
  provider: SupportedAIProvider,
  models: string[],
  requestedModel?: string | null,
): string {
  const requested = requestedModel?.trim();
  if (requested && !isLikelyImageModel(requested)) {
    return requested;
  }

  const firstTextModel = models.find((model) => !isLikelyImageModel(model));
  return firstTextModel || requested || TEXT_MODEL_DEFAULTS[provider] || 'gpt-4o-mini';
}

export function selectImageModel(
  provider: SupportedAIProvider,
  models: string[],
  requestedModel?: string | null,
): string {
  const requested = requestedModel?.trim();
  if (requested && isLikelyImageModel(requested)) {
    return requested;
  }

  const firstImageModel = models.find((model) => isLikelyImageModel(model));
  return firstImageModel || requested || IMAGE_MODEL_DEFAULTS[provider] || 'gpt-image-1';
}

export async function getActiveApiKey(
  userId: string,
  provider: SupportedAIProvider,
): Promise<ProviderConfig> {
  const userRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, provider as any)),
  });

  if (userRecord) {
    return fromUserRecord(userRecord);
  }

  const envRecord = fromEnv(provider);
  if (envRecord) {
    return envRecord;
  }

  throw new Error(`No active API key configured for provider "${provider}"`);
}

export async function getAvailableAiProviders(userId: string): Promise<ProviderConfig[]> {
  const userRecords = await db.query.userAiKeys.findMany({
    where: eq(userAiKeys.userId, userId),
  });

  const providerMap = new Map<SupportedAIProvider, ProviderConfig>();

  for (const record of userRecords) {
    providerMap.set(record.provider as SupportedAIProvider, fromUserRecord(record));
  }

  (Object.keys(ENV_PROVIDER_DEFAULTS) as SupportedAIProvider[]).forEach((provider) => {
    if (!providerMap.has(provider)) {
      const envRecord = fromEnv(provider);
      if (envRecord) {
        providerMap.set(provider, envRecord);
      }
    }
  });

  return Array.from(providerMap.values());
}
