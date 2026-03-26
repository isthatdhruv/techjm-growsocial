import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  angle: z.string().min(1).max(1000).optional(),
  title: z.string().min(1).max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  // Verify topic belongs to this user
  const scoredTopic = await db.query.scoredTopics.findFirst({
    where: and(eq(scoredTopics.id, id), eq(scoredTopics.userId, user.id)),
  });

  if (!scoredTopic) {
    return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  }

  // Update the raw topic with new angle/title
  const updateData: Record<string, string> = {};
  if (parsed.data.angle !== undefined) updateData.angle = parsed.data.angle;
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;

  if (Object.keys(updateData).length > 0) {
    await db
      .update(rawTopics)
      .set(updateData)
      .where(eq(rawTopics.id, scoredTopic.rawTopicId));
  }

  return NextResponse.json({ success: true, updated: Object.keys(updateData) });
}
