import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, scoredTopics } from '@techjm/db';
import { eq, and } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const topic = await db.query.scoredTopics.findFirst({
    where: and(eq(scoredTopics.id, id), eq(scoredTopics.userId, user.id)),
  });

  if (!topic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  await db
    .update(scoredTopics)
    .set({ status: 'rejected' })
    .where(eq(scoredTopics.id, id));

  return NextResponse.json({ success: true, status: 'rejected' });
}
