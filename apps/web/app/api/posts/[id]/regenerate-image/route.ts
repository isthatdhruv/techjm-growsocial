import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, posts, userModelConfig, userAiKeys } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { imageGenQueue } from '@/lib/queue-client';

export async function POST(
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

  if (!post.imagePrompt) {
    return NextResponse.json({ error: 'No image prompt available for this post' }, { status: 400 });
  }

  // Determine image model
  const modelCfg = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, user.id),
  });
  const imageConfig = modelCfg?.imageModel as { provider: string; model: string } | null;
  let imageProvider = imageConfig?.provider || 'replicate';
  let imageModel = imageConfig?.model || 'black-forest-labs/flux-2-pro';

  // Verify user has key for this provider
  const keyRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, imageProvider as any)),
  });

  if (!keyRecord) {
    // Try OpenAI fallback
    const openaiKey = await db.query.userAiKeys.findFirst({
      where: and(eq(userAiKeys.userId, user.id), eq(userAiKeys.provider, 'openai')),
    });
    if (openaiKey) {
      imageProvider = 'openai';
      imageModel = 'gpt-image-1';
    } else {
      return NextResponse.json({ error: 'No image generation provider available' }, { status: 400 });
    }
  }

  // Update status to generating
  await db
    .update(posts)
    .set({ status: 'generating', updatedAt: new Date() })
    .where(eq(posts.id, id));

  // Queue image generation
  await imageGenQueue.add(
    `img-regen-${id}-${Date.now()}`,
    {
      userId: user.id,
      postIds: [id],
      imagePrompt: post.imagePrompt,
      provider: imageProvider,
      model: imageModel,
    },
    { attempts: 3, backoff: { type: 'exponential', delay: 20000 } },
  );

  return NextResponse.json({ success: true, message: 'Regenerating image...' });
}
