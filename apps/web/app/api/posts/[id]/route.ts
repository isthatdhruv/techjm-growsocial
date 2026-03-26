import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts } from '@techjm/db';
import { eq, and } from 'drizzle-orm';

// PATCH /api/posts/[id] — Edit post caption/hashtags
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify post belongs to user
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, id), eq(posts.userId, user.id)),
  });

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const body = await request.json();
  const { caption, hashtags } = body;

  // Validate X caption length
  if (caption && post.platform === 'x' && caption.length > 280) {
    return NextResponse.json(
      { error: 'X/Twitter caption must be under 280 characters' },
      { status: 400 },
    );
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (caption !== undefined) updateData.caption = caption;
  if (hashtags !== undefined) updateData.hashtags = hashtags;

  await db.update(posts).set(updateData).where(eq(posts.id, id));

  return NextResponse.json({ success: true, updated: Object.keys(updateData).filter((k) => k !== 'updatedAt') });
}

// DELETE /api/posts/[id] — Delete a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify post belongs to user
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, id), eq(posts.userId, user.id)),
  });

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  await db.delete(posts).where(eq(posts.id, id));

  return NextResponse.json({ success: true });
}
