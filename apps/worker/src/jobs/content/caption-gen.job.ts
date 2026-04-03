import { Worker, Job } from 'bullmq';
import {
  db,
  scoredTopics,
  rawTopics,
  userNicheProfiles,
  userModelConfig,
  posts,
  getActiveApiKey,
  selectTextModel,
} from '@techjm/db';
import { eq } from 'drizzle-orm';
import { generateContent } from '@techjm/ai-adapters';
import type { AIProvider } from '@techjm/ai-adapters';
import { connection } from '../../redis.js';
import { QUEUE_NAMES, imagePromptGenQueue, type CaptionGenJobData, type ImagePromptGenJobData } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
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
  let activeProvider;
  try {
    activeProvider = await getActiveApiKey(userId, captionProvider as any);
    captionModel = selectTextModel(
      activeProvider.provider as any,
      activeProvider.models,
      captionModel,
    );
  } catch {
    const auto = await getAutoSelectedModel(userId, 'caption');
    if (!auto) throw new Error('No AI keys available');
    captionProvider = auto.provider;
    captionModel = auto.model;
    activeProvider = await getActiveApiKey(userId, captionProvider as any);
    captionModel = selectTextModel(
      activeProvider.provider as any,
      activeProvider.models,
      captionModel,
    );
    job.log(`Caption model fallback: using ${captionProvider}/${captionModel}`);
  }

  const resolvedCaptionProvider = activeProvider.provider as AIProvider;
  const resolvedCaptionModel = selectTextModel(
    activeProvider.provider as any,
    activeProvider.models,
    captionModel,
  );

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
  const createdPostIds: { linkedin?: string; x?: string } = {};

  for (const platform of platforms) {
    job.log(`Generating ${platform} caption with ${resolvedCaptionProvider}/${resolvedCaptionModel}`);
    const result = await generateContent({
      apiKey: activeProvider.apiKey,
      provider: resolvedCaptionProvider,
      model: resolvedCaptionModel,
      niche: niche.niche,
      topic: {
        title: topic.title,
        angle: topic.angle || '',
      },
      platform,
      seoKeywords: (seoData.keywords as string[]) || (scored.seoKeywords as string[]) || [],
      seoHashtags:
        platform === 'linkedin'
          ? (seoData.hashtags_linkedin as string[]) || (scored.seoHashtags as string[]) || []
          : (seoData.hashtags_x as string[]) || (scored.seoHashtags as string[]) || [],
      audiencePersonas:
        (audienceData.persona_match as string[]) || (scored.audiencePersonas as string[]) || [],
      ctaService: (cmfData.linked_service as string) || scored.cmfLinkedService || undefined,
      competitorAngle:
        (gapData.differentiation_angle as string) || scored.competitorDiffAngle || undefined,
      tone: niche.tone,
      examplePosts: (niche.examplePosts as string[]) || [],
      learnedPatterns,
      baseUrl: activeProvider.baseUrl ?? undefined,
    });

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

export const captionGenWorker = new Worker(QUEUE_NAMES.CAPTION_GEN, withErrorHandling('caption-gen', processCaptionGen), {
  connection,
  concurrency: 4,
});

captionGenWorker.on('failed', (job, err) => {
  console.error(`[caption-gen] Job ${job?.id} failed:`, err.message);
});
