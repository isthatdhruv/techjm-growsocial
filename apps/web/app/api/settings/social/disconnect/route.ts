import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { disconnectPlatformConnection } from '@/lib/social-connections';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { platform } = await request.json();
  if (!platform || !['linkedin', 'x'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  await disconnectPlatformConnection(user.id, platform);

  return NextResponse.json({ success: true });
}
