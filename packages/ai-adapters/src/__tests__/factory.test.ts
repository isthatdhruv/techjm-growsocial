import { describe, it, expect } from 'vitest';
import { AdapterFactory } from '../factory';
import { OpenAIAdapter } from '../providers/openai';
import { AnthropicAdapter } from '../providers/anthropic';
import { GoogleAdapter } from '../providers/google';
import { XAIAdapter } from '../providers/xai';
import { DeepSeekAdapter } from '../providers/deepseek';
import { MistralAdapter } from '../providers/mistral';
import { ReplicateAdapter } from '../providers/replicate';

describe('AdapterFactory', () => {
  describe('getAdapter', () => {
    it('returns OpenAIAdapter for openai', () => {
      expect(AdapterFactory.getAdapter('openai')).toBeInstanceOf(OpenAIAdapter);
    });

    it('returns AnthropicAdapter for anthropic', () => {
      expect(AdapterFactory.getAdapter('anthropic')).toBeInstanceOf(AnthropicAdapter);
    });

    it('returns GoogleAdapter for google', () => {
      expect(AdapterFactory.getAdapter('google')).toBeInstanceOf(GoogleAdapter);
    });

    it('returns XAIAdapter for xai', () => {
      expect(AdapterFactory.getAdapter('xai')).toBeInstanceOf(XAIAdapter);
    });

    it('returns DeepSeekAdapter for deepseek', () => {
      expect(AdapterFactory.getAdapter('deepseek')).toBeInstanceOf(DeepSeekAdapter);
    });

    it('returns MistralAdapter for mistral', () => {
      expect(AdapterFactory.getAdapter('mistral')).toBeInstanceOf(MistralAdapter);
    });

    it('returns ReplicateAdapter for replicate', () => {
      expect(AdapterFactory.getAdapter('replicate')).toBeInstanceOf(ReplicateAdapter);
    });

    it('throws for invalid provider', () => {
      expect(() => AdapterFactory.getAdapter('invalid' as any)).toThrow('No adapter for provider: invalid');
    });
  });

  describe('hasWebSearch', () => {
    it('returns true for openai', () => {
      expect(AdapterFactory.hasWebSearch('openai')).toBe(true);
    });

    it('returns true for anthropic', () => {
      expect(AdapterFactory.hasWebSearch('anthropic')).toBe(true);
    });

    it('returns true for google', () => {
      expect(AdapterFactory.hasWebSearch('google')).toBe(true);
    });

    it('returns true for xai', () => {
      expect(AdapterFactory.hasWebSearch('xai')).toBe(true);
    });

    it('returns false for deepseek', () => {
      expect(AdapterFactory.hasWebSearch('deepseek')).toBe(false);
    });

    it('returns false for mistral', () => {
      expect(AdapterFactory.hasWebSearch('mistral')).toBe(false);
    });

    it('returns false for replicate', () => {
      expect(AdapterFactory.hasWebSearch('replicate')).toBe(false);
    });
  });

  describe('hasXSearch', () => {
    it('returns true for xai', () => {
      expect(AdapterFactory.hasXSearch('xai')).toBe(true);
    });

    it('returns false for openai', () => {
      expect(AdapterFactory.hasXSearch('openai')).toBe(false);
    });

    it('returns false for anthropic', () => {
      expect(AdapterFactory.hasXSearch('anthropic')).toBe(false);
    });
  });

  describe('getCheapestModel', () => {
    it('returns anthropic haiku for sub_agent when available', () => {
      const result = AdapterFactory.getCheapestModel(
        [
          { provider: 'openai', models: ['gpt-5.4-mini'] },
          { provider: 'anthropic', models: ['claude-haiku-4-5-20251001'] },
        ],
        'sub_agent',
      );
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-haiku-4-5-20251001');
    });

    it('returns openai for sub_agent when anthropic unavailable', () => {
      const result = AdapterFactory.getCheapestModel(
        [{ provider: 'openai', models: ['gpt-5.4-nano'] }],
        'sub_agent',
      );
      expect(result.provider).toBe('openai');
    });

    it('returns anthropic sonnet for caption when available', () => {
      const result = AdapterFactory.getCheapestModel(
        [
          { provider: 'anthropic', models: ['claude-sonnet-4-6-20250514'] },
          { provider: 'openai', models: ['gpt-5.4-mini'] },
        ],
        'caption',
      );
      expect(result.provider).toBe('anthropic');
    });

    it('returns openai for discovery as first priority', () => {
      const result = AdapterFactory.getCheapestModel(
        [
          { provider: 'openai', models: ['gpt-5.4-mini'] },
          { provider: 'anthropic', models: ['claude-sonnet-4-6-20250514'] },
        ],
        'discovery',
      );
      expect(result.provider).toBe('openai');
    });

    it('falls back to first connected provider', () => {
      const result = AdapterFactory.getCheapestModel(
        [{ provider: 'replicate', models: ['flux-2-pro'] }],
        'sub_agent',
      );
      expect(result.provider).toBe('replicate');
      expect(result.model).toBe('flux-2-pro');
    });

    it('throws when no providers connected', () => {
      expect(() => AdapterFactory.getCheapestModel([], 'sub_agent')).toThrow(
        'No connected providers available',
      );
    });
  });
});
