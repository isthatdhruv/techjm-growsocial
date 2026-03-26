import type { AIProvider, AIAdapter, AdapterCapabilities } from './types';
import { OpenAIAdapter } from './providers/openai';
import { AnthropicAdapter } from './providers/anthropic';
import { GoogleAdapter } from './providers/google';
import { XAIAdapter } from './providers/xai';
import { DeepSeekAdapter } from './providers/deepseek';
import { MistralAdapter } from './providers/mistral';
import { ReplicateAdapter } from './providers/replicate';

const adapters: Record<AIProvider, AIAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  google: new GoogleAdapter(),
  xai: new XAIAdapter(),
  deepseek: new DeepSeekAdapter(),
  mistral: new MistralAdapter(),
  replicate: new ReplicateAdapter(),
};

// Model cost priority lists (cheapest/best for each task)
const SUB_AGENT_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { provider: 'openai', model: 'gpt-5.4-nano' },
  { provider: 'google', model: 'gemini-2.5-flash-lite' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'mistral', model: 'mistral-medium-latest' },
];

const CAPTION_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6-20250514' },
  { provider: 'openai', model: 'gpt-5.4-mini' },
  { provider: 'google', model: 'gemini-3.1-pro' },
  { provider: 'xai', model: 'grok-4.1-fast' },
];

const DISCOVERY_PRIORITY: { provider: AIProvider; model: string }[] = [
  { provider: 'openai', model: 'gpt-5.4-mini' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6-20250514' },
  { provider: 'google', model: 'gemini-3.1-pro' },
  { provider: 'xai', model: 'grok-4.1-fast' },
];

export class AdapterFactory {
  static getAdapter(provider: AIProvider): AIAdapter {
    const adapter = adapters[provider];
    if (!adapter) throw new Error(`No adapter for provider: ${provider}`);
    return adapter;
  }

  static async validateKey(provider: AIProvider, apiKey: string): Promise<AdapterCapabilities> {
    const adapter = this.getAdapter(provider);
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
