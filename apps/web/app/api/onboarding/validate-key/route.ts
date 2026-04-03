import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { withRateLimit } from '@/lib/rate-limit';
import { WEB_VALID_PROVIDERS, validateProviderApiKey } from '@/lib/ai-provider';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  provider: z.enum(WEB_VALID_PROVIDERS),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
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

    const { provider, apiKey, baseUrl } = parsed.data;
    const capabilities = await validateProviderApiKey(provider, apiKey, baseUrl);

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
