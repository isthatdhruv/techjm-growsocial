export const WEB_VALID_PROVIDERS = [
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

export type WebAIProvider = (typeof WEB_VALID_PROVIDERS)[number];

export interface ProviderValidationResult {
  valid: boolean;
  provider: WebAIProvider;
  web_search: boolean;
  x_search: boolean;
  image_gen: boolean;
  available_models: string[];
  error?: string;
}

function getCompatibleBaseUrl(provider: WebAIProvider, baseUrl?: string) {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'deepseek':
      return 'https://api.deepseek.com';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'openai_compatible':
      return baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1';
    case 'openai':
    default:
      return 'https://api.openai.com/v1';
  }
}

export function hasWebSearchProvider(provider: string): boolean {
  return ['openai', 'anthropic', 'google', 'xai'].includes(provider);
}

export async function validateProviderApiKey(
  provider: WebAIProvider,
  apiKey: string,
  baseUrl?: string,
): Promise<ProviderValidationResult> {
  try {
    switch (provider) {
      case 'google': {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = await response.json();
        return {
          valid: true,
          provider,
          web_search: true,
          x_search: false,
          image_gen: false,
          available_models: (data.models || []).map((model: { name: string }) => model.name.replace('models/', '')),
        };
      }
      case 'anthropic': {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-latest',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (response.status === 401 || response.status === 403) {
          throw new Error(await response.text());
        }
        return {
          valid: true,
          provider,
          web_search: true,
          x_search: false,
          image_gen: false,
          available_models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
        };
      }
      case 'replicate': {
        const response = await fetch('https://api.replicate.com/v1/account', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return {
          valid: true,
          provider,
          web_search: false,
          x_search: false,
          image_gen: true,
          available_models: ['black-forest-labs/flux-1.1-pro'],
        };
      }
      default: {
        const response = await fetch(`${getCompatibleBaseUrl(provider, baseUrl)}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = await response.json();
        const models = Array.isArray(data.data)
          ? data.data.map((model: { id: string }) => model.id)
          : [];

        return {
          valid: true,
          provider,
          web_search: hasWebSearchProvider(provider),
          x_search: provider === 'xai',
          image_gen: provider === 'openai',
          available_models: models,
        };
      }
    }
  } catch (error) {
    return {
      valid: false,
      provider,
      web_search: false,
      x_search: false,
      image_gen: false,
      available_models: [],
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

interface GenerateContentParams {
  apiKey: string;
  provider: WebAIProvider;
  model: string;
  niche: string;
  topic: { title: string; angle?: string | null };
  platform: 'linkedin' | 'x';
  tone: string;
  seoKeywords: string[];
  seoHashtags: string[];
  audiencePersonas: string[];
  ctaService?: string;
  competitorAngle?: string;
  examplePosts: string[];
  learnedPatterns?: unknown;
  baseUrl?: string;
}

function buildPrompt(input: GenerateContentParams) {
  return `You write high-performing ${input.platform === 'linkedin' ? 'LinkedIn' : 'X'} posts for ${input.niche}.

Topic: ${input.topic.title}
Angle: ${input.topic.angle || 'Use the strongest timely angle for this topic'}
Tone: ${input.tone}
Audience: ${input.audiencePersonas.join(', ') || 'General business audience'}
Keywords: ${input.seoKeywords.join(', ') || 'None'}
Hashtags: ${input.seoHashtags.join(' ') || 'None'}
CTA: ${input.ctaService || 'None'}
Differentiation: ${input.competitorAngle || 'None'}
Examples: ${input.examplePosts.join(' || ') || 'None'}
Learned patterns: ${input.learnedPatterns ? JSON.stringify(input.learnedPatterns) : 'None'}

Return ONLY valid JSON:
{
  "caption": "post text",
  "hashtags": ["#tag"],
  "estimated_word_count": 180
}`;
}

function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned) as T;
}

export async function generateStructuredObjectWithProvider<T>(input: {
  apiKey: string;
  provider: WebAIProvider;
  model: string;
  prompt: string;
  baseUrl?: string;
}): Promise<T> {
  if (input.provider === 'google') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('') || '';

    return parseJson<T>(text);
  }

  if (input.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: input.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text = data.content?.find((item: { type: string }) => item.type === 'text')?.text || '';
    return parseJson<T>(text);
  }

  if (input.provider === 'replicate') {
    throw new Error('Replicate does not support structured text generation');
  }

  const response = await fetch(`${getCompatibleBaseUrl(input.provider, input.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseJson<T>(text);
}

export async function generateContentWithProvider(input: GenerateContentParams) {
  const prompt = buildPrompt(input);

  if (input.provider === 'google') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
    return parseJson<{ caption: string; hashtags: string[]; estimated_word_count: number }>(text);
  }

  if (input.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const text = data.content?.find((item: { type: string }) => item.type === 'text')?.text || '';
    return parseJson<{ caption: string; hashtags: string[]; estimated_word_count: number }>(text);
  }

  if (input.provider === 'replicate') {
    throw new Error('Replicate cannot generate captions');
  }

  const response = await fetch(`${getCompatibleBaseUrl(input.provider, input.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseJson<{ caption: string; hashtags: string[]; estimated_word_count: number }>(text);
}
