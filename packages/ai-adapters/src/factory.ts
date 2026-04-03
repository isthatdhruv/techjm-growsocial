import type { AIProvider, AIAdapter, AdapterCapabilities } from './types.js';
import { OpenAIAdapter } from './providers/openai.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { GoogleAdapter } from './providers/google.js';
import { XAIAdapter } from './providers/xai.js';
import { DeepSeekAdapter } from './providers/deepseek.js';
import { MistralAdapter } from './providers/mistral.js';
import { ReplicateAdapter } from './providers/replicate.js';
import { GroqAdapter } from './providers/groq.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible.js';

const adapters: Record<AIProvider, AIAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  xai: new XAIAdapter(),
  deepseek: new DeepSeekAdapter(),
  mistral: new MistralAdapter(),
  replicate: new ReplicateAdapter(),
  groq: new GroqAdapter(),
  openai_compatible: new OpenAICompatibleAdapter({
    baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1',
    providerName: 'OpenAI-compatible provider',
    providerId: 'openai_compatible',
  }),
};

// Model cost priority lists (cheapest/best for each task)
const SUB_AGENT_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'google', model: 'gemini-1.5-flash' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'mistral', model: 'mistral-large-latest' },
];

const CAPTION_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'google', model: 'gemini-1.5-pro' },
  { provider: 'xai', model: 'grok-2-latest' },
];

const DISCOVERY_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
  { provider: 'google', model: 'gemini-1.5-pro' },
  { provider: 'xai', model: 'grok-2-latest' },
];

export class AdapterFactory {
  static getAdapter(provider: AIProvider, options?: { baseUrl?: string | null }): AIAdapter {
    if (provider === 'openai_compatible') {
      return new OpenAICompatibleAdapter({
        baseURL: options?.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1',
        providerName: 'OpenAI-compatible provider',
        providerId: provider,
      });
    }

    const adapter = adapters[provider];
    if (!adapter) throw new Error(`No adapter for provider: ${provider}`);
    return adapter;
  }

  static async validateKey(
    provider: AIProvider,
    apiKey: string,
    options?: { baseUrl?: string | null },
  ): Promise<AdapterCapabilities> {
    const adapter = this.getAdapter(provider, options);
    return adapter.testConnection(apiKey);
  }

  static getCheapestModel(
    connectedProviders: { provider: AIProvider; models: string[] }[],
    task: 'sub_agent' | 'caption' | 'discovery',
  ): { provider: AIProvider; model: string } {
    const priority =
      task === 'sub_agent'
        ? SUB_AGENT_PRIORITY
        : task === 'caption'
          ? CAPTION_PRIORITY
          : DISCOVERY_PRIORITY;

    const connectedSet = new Set(connectedProviders.map((p) => p.provider));

    for (const candidate of priority) {
      if (connectedSet.has(candidate.provider)) {
        return candidate;
      }
    }

    // Fallback: return first connected provider with its first model
    const first = connectedProviders[0];
    if (first) {
      return { provider: first.provider, model: first.models[0] };
    }

    throw new Error('No connected providers available');
  }

  static hasWebSearch(provider: AIProvider): boolean {
    return ['openai', 'anthropic', 'google', 'xai'].includes(provider);
  }

  static hasXSearch(provider: AIProvider): boolean {
    return provider === 'xai';
  }
}
