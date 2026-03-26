import { Worker, Job } from 'bullmq';
import { db, userAiKeys, posts } from '@techjm/db';
import { decryptApiKey } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { AIProvider } from '@techjm/ai-adapters';
import { v2 as cloudinary } from 'cloudinary';
import { connection } from '../../redis.js';
import { QUEUE_NAMES, type ImageGenJobData } from '../../queues.js';

// Configure Cloudinary (optional — gracefully degrades if not configured)
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function processImageGen(job: Job<ImageGenJobData>) {
  const { userId, postIds, imagePrompt, imageStyle, provider, model } = job.data;

  job.log(`Image gen: provider=${provider}, model=${model}, posts=${postIds.length}`);

  // 1. Get API key
  const keyRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, provider as any)),
  });
  if (!keyRecord) throw new Error(`No key for ${provider}`);
  const apiKey = decryptApiKey(keyRecord.apiKeyEnc);

  // 2. Generate image via adapter
  const adapter = AdapterFactory.getAdapter(provider as AIProvider);
  const result = await adapter.generateImage(apiKey, model, imagePrompt, {
    width: 1024,
    height: 1024,
    style: imageStyle,
  });

  job.log(`Image generated: ${result.image_url.slice(0, 80)}...`);

  // 3. Upload to Cloudinary (if configured)
  let baseUrl = result.image_url;
  let cloudinaryPublicId: string | null = null;

  if (process.env.CLOUDINARY_CLOUD_NAME) {
    try {
      const uploadResult = await cloudinary.uploader.upload(result.image_url, {
        folder: `techjm/${userId}`,
        public_id: `post-${postIds[0]}-${Date.now()}`,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });
      baseUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
      job.log(`Uploaded to Cloudinary: ${baseUrl}`);
    } catch (cloudinaryError: any) {
      job.log(`Cloudinary upload failed: ${cloudinaryError.message}. Using direct URL.`);
    }
  }

  // 4. Generate platform-specific variants
  const variants: Record<string, string> = {};

  if (cloudinaryPublicId) {
    variants.linkedin = cloudinary.url(cloudinaryPublicId, {
      width: 1200,
      height: 627,
      crop: 'fill',
      gravity: 'center',
      quality: 'auto',
      format: 'jpg',
    });
    variants.x = cloudinary.url(cloudinaryPublicId, {
      width: 1600,
      height: 900,
      crop: 'fill',
      gravity: 'center',
      quality: 'auto',
      format: 'jpg',
    });
    variants.square = cloudinary.url(cloudinaryPublicId, {
      width: 1080,
      height: 1080,
      crop: 'fill',
      gravity: 'center',
      quality: 'auto',
      format: 'jpg',
    });
  } else {
    variants.linkedin = baseUrl;
    variants.x = baseUrl;
    variants.square = baseUrl;
  }

  // 5. Update all post rows with image URLs
  for (const postId of postIds) {
    const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
    const platformVariant =
      post?.platform === 'linkedin'
        ? variants.linkedin
        : post?.platform === 'x'
          ? variants.x
          : variants.square;

    await db
      .update(posts)
      .set({
        imageUrl: platformVariant,
        imageUrls: variants,
        status: 'review',
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));
  }

  job.log(`Updated ${postIds.length} posts with image URLs. Status: review`);

  return {
    imageUrl: baseUrl,
    variants,
    postsUpdated: postIds.length,
  };
}

export const imageGenWorker = new Worker(QUEUE_NAMES.IMAGE_GEN, processImageGen, {
  connection,
  concurrency: 2, // Lower concurrency — image gen is expensive
});

imageGenWorker.on('failed', async (job, err) => {
  console.error(`[image-gen] Job ${job?.id} failed:`, err.message);

  // If image gen fails after retries, mark posts as review anyway (text-only)
  if (job?.data?.postIds && job.attemptsMade >= (job.opts?.attempts || 3)) {
    for (const postId of job.data.postIds) {
      try {
        await db
          .update(posts)
          .set({ status: 'review', updatedAt: new Date() })
          .where(eq(posts.id, postId));
      } catch (e: any) {
        console.error(`Failed to update post ${postId}:`, e.message);
      }
    }
  }
});
