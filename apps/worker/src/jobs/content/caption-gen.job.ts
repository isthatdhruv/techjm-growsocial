import { Worker, Job } from 'bullmq';
import { db, scoredTopics, rawTopics, userNicheProfiles, userModelConfig, userAiKeys, posts } from '@techjm/db';
import { decryptApiKey } from '@techjm/db';
import { eq, and } from 'drizzle-orm';
import { AdapterFactory } from '@techjm/ai-adapters';
import type { AIProvider, CaptionRequest } from '@techjm/ai-adapters';
import { connection } from '../../redis.js';
import { imagePromptGenQueue, type CaptionGenJobData, type ImagePromptGenJobData } from '../../queues.js';
import { getAutoSelectedModel } from '../sub-agents/model-selector.js';

async function processCaptionGen(job: Job<CaptionGenJobData>) {
  const { userId, scoredTopicId, rawTopicId, platforms } = job.data;

  job.log(`Caption gen: topic=${scoredTopicId}, platforms=${platforms.join(',')}`);

  // 1. Load all context
  const [scored, topic, niche, modelCfg] = await Promise.all([
    db.query.scoredTopics.findFirst({ where: eq(scoredTopics.id, scoredTopicId) }),
    db.query.rawTopics.findFirst({ where: eq(rawTopics.id, rawTopicId) }),
    db.query.userNicheProfiles.findFirst({ where: eq(userNicheProfiles.userId, userId) }),
    db.query.userModelConfig.findFirst({ where: eq(userModelConfig.userId, userId) }),
  ]);

  if (!scored || !topic || !niche) {
    throw new Error('Missing data for caption generation');
  }

  // 2. Determine caption model
  const captionConfig = modelCfg?.captionModel as { provider: string; model: string } | null;
  let captionProvider = captionConfig?.provider;
  let captionModel = captionConfig?.model;

  if (!captionProvider || !captionModel) {
    const auto = await getAutoSelectedModel(userId, 'caption');
    if (!auto) throw new Error('No AI provider available for caption generation');
    captionProvider = auto.provider;
    captionModel = auto.model;
    job.log(`Caption model auto-selected: ${captionProvider}/${captionModel}`);
  }

  // 3. Get API key for caption provider
  let keyRecord = await db.query.userAiKeys.findFirst({
    where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, captionProvider as any)),
  });

  if (!keyRecord) {
    // Fallback: auto-select any available provider
    const auto = await getAutoSelectedModel(userId, 'caption');
    if (!auto) throw new Error('No AI keys available');
    captionProvider = auto.provider;
    captionModel = auto.model;
    keyRecord = await db.query.userAiKeys.findFirst({
      where: and(eq(userAiKeys.userId, userId), eq(userAiKeys.provider, captionProvider as any)),
    });
    if (!keyRecord) throw new Error('No AI keys available');
    job.log(`Caption model fallback: using ${captionProvider}/${captionModel}`);
  }

  const apiKey = decryptApiKey(keyRecord.apiKeyEnc);

  // 4. Extract sub-agent outputs for prompt injection
  const subAgentOutputs = (scored.subAgentOutputs as Record<string, any>) || {};
  const seoData = subAgentOutputs.seo || {};
  const audienceData = subAgentOutputs.audience_fit || {};
  const cmfData = subAgentOutputs.content_market_fit || {};
  const gapData = subAgentOutputs.competitor_gap || {};

  // 5. Get brand kit from niche profile
  const brandKit = (niche.brandKit as any) || {};
  const learnedPatterns = brandKit.learned_patterns || null;

  // 6. Generate caption for each platform
  const adapter = AdapterFactory.getAdapter(captionProvider as AIProvider);
  const createdPostIds: { linkedin?: string; x?: string } = {};

  for (const platform of platforms) {
    const request: CaptionRequest = {
      topic_title: topic.title,
      topic_angle: topic.angle || '',
      platform,
      seo_keywords: (seoData.keywords as string[]) || (scored.seoKeywords as string[]) || [],
      seo_hashtags:
        platform === 'linkedin'
          ? (seoData.hashtags_linkedin as string[]) || (scored.seoHashtags as string[]) || []
          : (seoData.hashtags_x as string[]) || (scored.seoHashtags as string[]) || [],
      audience_personas: (audienceData.persona_match as string[]) || (scored.audiencePersonas as string[]) || [],
      cta_service: (cmfData.linked_service as string) || scored.cmfLinkedService || undefined,
      competitor_angle: (gapData.differentiation_angle as string) || scored.competitorDiffAngle || undefined,
      tone: niche.tone,
      example_posts: (niche.examplePosts as string[]) || [],
      learned_patterns: learnedPatterns,
    };

    job.log(`Generating ${platform} caption with ${captionProvider}/${captionModel}`);

    const result = await adapter.generateCaption(apiKey, captionModel, request);

    // 7. Save to posts table
    const [post] = await db
      .insert(posts)
      .values({
        userId,
        topicId: scoredTopicId,
        platform: platform as any,
        caption: result.caption,
        hashtags: result.hashtags || [],
        status: 'generating', // Still generating image
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: posts.id });

    createdPostIds[platform as 'linkedin' | 'x'] = post.id;
    job.log(`Created ${platform} post: ${post.id} (${result.caption.slice(0, 80)}...)`);
  }

  // 8. Queue image prompt generation
  // Use the LinkedIn caption as the base (it's longer/more detailed)
  const primaryPostId = createdPostIds.linkedin || createdPostIds.x;
  const primaryPost = primaryPostId
    ? await db.query.posts.findFirst({ where: eq(posts.id, primaryPostId) })
    : null;

  await imagePromptGenQueue.add(
    `img-prompt-${scoredTopicId}`,
    {
      userId,
      scoredTopicId,
      linkedinPostId: createdPostIds.linkedin,
      xPostId: createdPostIds.x,
      captionText: primaryPost?.caption || topic.title,
    } satisfies ImagePromptGenJobData,
    { attempts: 2, backoff: { type: 'exponential', delay: 15000 } },
  );

  return {
    platforms,
    postIds: createdPostIds,
  };
}

export const captionGenWorker = new Worker(QUEUE_NAMES.CAPTION_GEN, processCaptionGen, {
  connection,
  concurrency: 4,
});

captionGenWorker.on('failed', (job, err) => {
  console.error(`[caption-gen] Job ${job?.id} failed:`, err.message);
});

// Need to import QUEUE_NAMES for the worker registration
import { QUEUE_NAMES } from '../../queues.js';
