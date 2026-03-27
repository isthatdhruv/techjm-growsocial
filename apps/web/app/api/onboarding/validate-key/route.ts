import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { withRateLimit } from '@/lib/rate-limit';
import { AdapterFactory, type AIProvider } from '@techjm/ai-adapters';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const validProviders = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'replicate'] as const;

const bodySchema = z.object({
  provider: z.enum(validProviders),
  apiKey: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitResponse = await withRateLimit(user.id, 'validate:key');
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { provider, apiKey } = parsed.data;
    const capabilities = await AdapterFactory.validateKey(provider as AIProvider, apiKey);

    return NextResponse.json({ capabilities });
  } catch (err) {
    console.error('Key validation error:', err);
    const message = err instanceof Error ? err.message : 'Validation failed';
    return NextResponse.json(
      { error: message, capabilities: { valid: false, error: message } },
      { status: 400 },
    );
  }
}
