import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, platformConnections } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  platform: z.enum(['linkedin', 'x']),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    await db
      .delete(platformConnections)
      .where(
        and(
          eq(platformConnections.userId, user.id),
          eq(platformConnections.platform, parsed.data.platform),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Social disconnect error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
