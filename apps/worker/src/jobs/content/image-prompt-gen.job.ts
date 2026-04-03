import { Worker, Job } from 'bullmq';
import { db, userNicheProfiles, userModelConfig, posts, getActiveApiKey, selectImageModel, selectTextModel } from '@techjm/db';
import { eq } from 'drizzle-orm';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { AIProvider } from '@techjm/ai-adapters';
import { connection } from '../../redis.js';
import {
  imageGenQueue,
  QUEUE_NAMES,
  type ImagePromptGenJobData,
  type ImageGenJobData,
} from '../../queues.js';
import { getAutoSelectedModel } from '../sub-agents/model-selector.js';
import { withErrorHandling } from '../../lib/error-handler.js';

async function processImagePromptGen(job: Job<ImagePromptGenJobData>) {
  const { userId, scoredTopicId, linkedinPostId, xPostId, captionText } = job.data;

  job.log(`Image prompt gen: topic=${scoredTopicId}`);

  // 1. Load niche profile for brand kit
  const niche = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  });
  const brandKit = (niche?.brandKit as any) || {};

  // 2. Get user's caption model (reuse for image prompt generation)
  const modelCfg = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, userId),
  });
  const captionConfig = modelCfg?.captionModel as { provider: string; model: string } | null;
  let provider = captionConfig?.provider;
  let model = captionConfig?.model;

  if (!provider || !model) {
    const auto = await getAutoSelectedModel(userId, 'caption');
    if (!auto) throw new Error('No AI provider available for image prompt generation');
    provider = auto.provider;
    model = auto.model;
  }

  // 3. Get API key
  const activeProvider = await getActiveApiKey(userId, provider as any);
  const resolvedPromptProvider = activeProvider.provider as AIProvider;
  const resolvedPromptModel = selectTextModel(
    activeProvider.provider as any,
    activeProvider.models,
    model,
  );

  // 4. Generate image prompt
  const adapter = AdapterFactory.getAdapter(resolvedPromptProvider, {
    baseUrl: activeProvider.baseUrl,
  });
  const result = await adapter.generateImagePrompt(
    activeProvider.apiKey,
    resolvedPromptModel,
    captionText,
    brandKit,
  );

  job.log(`Image prompt: "${result.prompt.slice(0, 100)}..."`);

  // 5. Store prompt on post rows
  const postIds = [linkedinPostId, xPostId].filter(Boolean) as string[];
  for (const postId of postIds) {
    await db
      .update(posts)
      .set({ imagePrompt: result.prompt, updatedAt: new Date() })
      .where(eq(posts.id, postId));
  }

  // 6. Determine image model
  const imageConfig = modelCfg?.imageModel as { provider: string; model: string } | null;
  let imageProvider = imageConfig?.provider;
  let imageModel = imageConfig?.model;

  if (!imageProvider || !imageModel) {
    const auto = await getAutoSelectedModel(userId, 'image');
    if (auto) {
      imageProvider = auto.provider;
      imageModel = auto.model;
    }
  }

  // Verify we have any usable key for the image provider
  if (imageProvider) {
    try {
      const activeImageProvider = await getActiveApiKey(userId, imageProvider as any);
      imageModel = selectImageModel(activeImageProvider.provider as any, activeImageProvider.models, imageModel);
    } catch {
      imageProvider = undefined;
      imageModel = undefined;
    }
  }

  if (!imageProvider || !imageModel) {
    // No image provider available — mark posts as ready without image
    job.log('WARNING: No image provider available. Posts will be text-only.');
    for (const postId of postIds) {
      await db
        .update(posts)
        .set({ status: 'review', updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }
    return { imageGenerated: false, reason: 'no_image_provider' };
  }

  // 7. Queue image generation
  await imageGenQueue.add(
    `img-gen-${scoredTopicId}`,
    {
      userId,
      postIds,
      imagePrompt: result.prompt,
      imageStyle: result.style || brandKit.image_style,
      provider: imageProvider,
      model: imageModel,
    } satisfies ImageGenJobData,
    { attempts: 3, backoff: { type: 'exponential', delay: 20000 } },
  );

  return { imagePrompt: result.prompt, imageProvider, imageModel };
}

export const imagePromptGenWorker = new Worker(QUEUE_NAMES.IMAGE_PROMPT_GEN, withErrorHandling('image-prompt-gen', processImagePromptGen), {
  connection,
  concurrency: 4,
});

imagePromptGenWorker.on('failed', (job, err) => {
  console.error(`[image-prompt-gen] Job ${job?.id} failed:`, err.message);
});
