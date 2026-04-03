import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { searchKnowledge } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const query = String(body?.query || '').trim();
  const limit = Math.min(Number(body?.limit || 8), 20);

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const results = await searchKnowledge(user.id, query, limit);
  return NextResponse.json({ results });
}
