'use client';

import { useState } from 'react';

interface ProviderCapabilities {
  web_search: boolean;
  x_search: boolean;
  image_gen: boolean;
  available_models: string[];
}

const keyUrls: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  xai: 'https://console.x.ai',
  deepseek: 'https://platform.deepseek.com/api_keys',
  mistral: 'https://console.mistral.ai/api-keys',
  replicate: 'https://replicate.com/account/api-tokens',
  groq: 'https://console.groq.com/keys',
  openai_compatible: '#',
};

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

export function ProviderKeyInput({
  provider,
  recommended = false,
  onValidate,
  capabilities,
  error,
  apiKey,
  onApiKeyChange,
  baseUrl,
  onBaseUrlChange,
}: {
  provider: string;
  recommended?: boolean;
  onValidate: () => void;
  capabilities: ProviderCapabilities | null;
  error: string | null;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  baseUrl?: string;
  onBaseUrlChange?: (baseUrl: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);

  async function handleValidate() {
    setValidating(true);
    await onValidate();
    setValidating(false);
  }

  const status = capabilities ? 'valid' : error ? 'invalid' : apiKey ? 'filled' : 'empty';

  return (
    <div
      className={`glass rounded-xl p-4 transition-all ${
        recommended ? 'ring-1 ring-blue/40' : ''
      } ${status === 'valid' ? 'ring-1 ring-tertiary/30' : ''}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {providerLabels[provider] || provider}
          </span>
          {recommended && (
            <span className="rounded bg-blue/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">
              Recommended
            </span>
          )}
        </div>
        {keyUrls[provider] === '#' ? (
          <span className="text-xs text-text-muted">Custom compatible endpoint</span>
        ) : (
          <a
            href={keyUrls[provider]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-accent"
          >
            Get a key &rarr;
          </a>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-10 text-sm text-white placeholder:text-text-muted/30 focus:border-accent/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted/40 hover:text-text-muted"
          >
            {showKey ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={handleValidate}
          disabled={!apiKey || validating}
          className="rounded-lg bg-blue/20 px-4 py-2 text-sm font-medium text-secondary transition-all hover:bg-blue/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {validating ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
              Checking
            </span>
          ) : (
            'Validate'
          )}
        </button>
      </div>

      {provider === 'openai_compatible' && onBaseUrlChange ? (
        <div className="mt-2">
          <input
            type="url"
            value={baseUrl || ''}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder="https://your-provider.example.com/v1"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-text-muted/30 focus:border-accent/40 focus:outline-none"
          />
        </div>
      ) : null}

      {/* Status area */}
      <div className="mt-2.5">
        {status === 'empty' && (
          <p className="text-xs text-text-muted/50">Not connected</p>
        )}
        {status === 'valid' && capabilities && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-tertiary">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Connected
            </span>
            {capabilities.web_search && (
              <span className="rounded bg-blue/15 px-2 py-0.5 text-[10px] font-medium text-secondary">
                Web Search
              </span>
            )}
            {capabilities.x_search && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                X Search
              </span>
            )}
            {capabilities.image_gen && (
              <span className="rounded bg-tertiary/15 px-2 py-0.5 text-[10px] font-medium text-tertiary">
                Image Gen
              </span>
            )}
          </div>
        )}
        {status === 'invalid' && error && (
          <p className="flex items-center gap-1 text-xs text-error">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
