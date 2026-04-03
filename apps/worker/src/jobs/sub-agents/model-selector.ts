import { getAvailableAiProviders, selectImageModel, selectTextModel } from '@techjm/db';

import type { SupportedAIProvider } from '@techjm/db';

const SUB_AGENT_MODEL_PRIORITY: { provider: SupportedAIProvider; model: string }[] = [
  { provider: 'anthropic', model: 'claude-3-5-haiku-latest' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  { provider: 'google', model: 'gemini-1.5-flash' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'mistral', model: 'mistral-large-latest' },
  { provider: 'xai', model: 'grok-2-latest' },
  { provider: 'openai', model: 'gpt-4o' },
];

const CAPTION_MODEL_PRIORITY: { provider: SupportedAIProvider; model: string }[] = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'google', model: 'gemini-1.5-pro' },
  { provider: 'xai', model: 'grok-2-latest' },
];

const IMAGE_MODEL_PRIORITY: { provider: SupportedAIProvider; model: string }[] = [
  { provider: 'replicate', model: 'black-forest-labs/flux-1.1-pro' },
  { provider: 'openai', model: 'gpt-image-1' },
  { provider: 'openai', model: 'dall-e-3' },
];

export async function getAutoSelectedModel(
  userId: string,
  task: 'sub_agent' | 'caption' | 'image',
): Promise<{ provider: string; model: string } | null> {
  const providers = await getAvailableAiProviders(userId);
  const connectedProviders = new Map(providers.map((provider) => [provider.provider, provider]));

  const priority =
    task === 'sub_agent'
      ? SUB_AGENT_MODEL_PRIORITY
      : task === 'image'
        ? IMAGE_MODEL_PRIORITY
        : CAPTION_MODEL_PRIORITY;

  for (const candidate of priority) {
    const provider = connectedProviders.get(candidate.provider);
    if (provider) {
      if (task === 'image' && !provider.capabilities.image_gen) {
        continue;
      }

      const preferredModel = provider.models.find((model) => model === candidate.model);
      const fallbackModel =
        task === 'image'
          ? selectImageModel(candidate.provider, provider.models, preferredModel || candidate.model)
          : selectTextModel(candidate.provider, provider.models, preferredModel || candidate.model);

      return {
        provider: candidate.provider,
        model: preferredModel || fallbackModel || candidate.model,
      };
    }
  }

  const firstProvider =
    task === 'image'
      ? providers.find((provider) => provider.capabilities.image_gen)
      : providers[0];

  if (firstProvider) {
    const fallbackModel =
      task === 'image'
        ? selectImageModel(firstProvider.provider, firstProvider.models)
        : selectTextModel(firstProvider.provider, firstProvider.models);

    return {
      provider: firstProvider.provider,
      model: fallbackModel,
    };
  }

  return null;
}
