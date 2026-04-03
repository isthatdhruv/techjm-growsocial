import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { testPlatformConnection } from '@/lib/social-connections';
import { z } from 'zod';

const bodySchema = z.object({
  platform: z.enum(['linkedin', 'x']),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  try {
    const result = await testPlatformConnection(user.id, parsed.data.platform);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Connection test failed unexpectedly.',
      },
      { status: 500 },
    );
  }
}
