import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, platformConnections } from '@techjm/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connections = await db
      .select({
        platform: platformConnections.platform,
        accountName: platformConnections.accountName,
        accountId: platformConnections.accountId,
        orgUrn: platformConnections.orgUrn,
        connectionHealth: platformConnections.connectionHealth,
      })
      .from(platformConnections)
      .where(eq(platformConnections.userId, user.id));

    return NextResponse.json({ connections });
  } catch (err) {
    console.error('Socials fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
