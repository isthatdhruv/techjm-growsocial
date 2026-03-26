import { db, userAiKeys } from '@techjm/db';
import { eq } from 'drizzle-orm';

// Priority order: cheapest first
const SUB_AGENT_MODEL_PRIORITY = [
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { provider: 'openai', model: 'gpt-5.4-nano' },
  { provider: 'google', model: 'gemini-2.5-flash-lite' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'mistral', model: 'mistral-medium-latest' },
  { provider: 'xai', model: 'grok-4.1-fast' },
  { provider: 'openai', model: 'gpt-5.4-mini' },
];

const CAPTION_MODEL_PRIORITY = [
  { provider: 'anthropic', model: 'claude-sonnet-4-6-20250514' },
  { provider: 'openai', model: 'gpt-5.4-mini' },
  { provider: 'google', model: 'gemini-3.1-pro' },
  { provider: 'xai', model: 'grok-4.1-fast' },
];

const IMAGE_MODEL_PRIORITY = [
  { provider: 'replicate', model: 'black-forest-labs/flux-2-pro' },
  { provider: 'openai', model: 'gpt-image-1' },
];

export async function getAutoSelectedModel(
  userId: string,
  task: 'sub_agent' | 'caption' | 'image',
): Promise<{ provider: string; model: string } | null> {
  const keys = await db.query.userAiKeys.findMany({
    where: eq(userAiKeys.userId, userId),
    columns: { provider: true },
  });
  const connectedProviders = new Set<string>(keys.map((k) => k.provider));

  const priority =
    task === 'sub_agent'
      ? SUB_AGENT_MODEL_PRIORITY
      : task === 'image'
        ? IMAGE_MODEL_PRIORITY
        : CAPTION_MODEL_PRIORITY;

  for (const candidate of priority) {
    if (connectedProviders.has(candidate.provider)) {
      return candidate;
    }
  }

  return null;
}
