import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import {
  db,
  rawTopics,
  scoredTopics,
  userNicheProfiles,
  userModelConfig,
  selectTextModel,
} from '@techjm/db';
import { and, eq } from 'drizzle-orm';
import { getAvailableProvidersForUser, getResolvedKeyForProvider } from '@/lib/ai-key-resolver';
import { searchKnowledge } from '@/lib/knowledge';
import { generateContentWithProvider } from '@/lib/ai-provider';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    topicId,
    title,
    angle,
    platform = 'linkedin',
    provider: requestedProvider,
    model: requestedModel,
    knowledgeQuery,
    useKnowledge = false,
  } = body ?? {};

  const nicheProfile = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, user.id),
  });

  if (!nicheProfile) {
    return NextResponse.json({ error: 'Niche profile is required before generating content' }, { status: 400 });
  }

  let topicTitle = title as string | undefined;
  let topicAngle = angle as string | undefined;
  let scoredTopic;

  if (topicId && typeof topicId === 'string') {
    scoredTopic = await db.query.scoredTopics.findFirst({
      where: and(eq(scoredTopics.id, topicId), eq(scoredTopics.userId, user.id)),
    });

    if (!scoredTopic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const rawTopic = await db.query.rawTopics.findFirst({
      where: eq(rawTopics.id, scoredTopic.rawTopicId),
    });

    topicTitle = rawTopic?.title || topicTitle;
    topicAngle = rawTopic?.angle || topicAngle;
  }

  if (!topicTitle) {
    return NextResponse.json({ error: 'title or topicId is required' }, { status: 400 });
  }

  const modelConfig = await db.query.userModelConfig.findFirst({
    where: eq(userModelConfig.userId, user.id),
  });
  const configuredModel = modelConfig?.captionModel as { provider?: string; model?: string } | null;
  const availableProviders = (await getAvailableProvidersForUser(user.id)).filter(
    (provider) => provider.provider !== 'replicate',
  );
  const fallbackModel = availableProviders[0]
    ? {
        provider: availableProviders[0].provider,
        model: selectTextModel(
          availableProviders[0].provider,
          availableProviders[0].models,
          availableProviders[0].models[0] || 'gpt-4o-mini',
        ),
      }
    : null;

  const provider = requestedProvider || configuredModel?.provider || fallbackModel?.provider;
  const model = requestedModel || configuredModel?.model || fallbackModel?.model;

  if (!provider || !model) {
    return NextResponse.json(
      { error: 'No caption model is configured. Add a user key or set a default provider in .env.' },
      { status: 400 },
    );
  }

  const activeProvider = await getResolvedKeyForProvider(user.id, provider as any);
  if (!activeProvider) {
    return NextResponse.json(
      { error: `No key available for provider ${provider}` },
      { status: 400 },
    );
  }
  const resolvedModel = selectTextModel(
    activeProvider.provider as any,
    activeProvider.models,
    model,
  );
  const subAgentOutputs = (scoredTopic?.subAgentOutputs as Record<string, any>) || {};
  const seoData = subAgentOutputs.seo || {};
  const audienceData = subAgentOutputs.audience_fit || {};
  const cmfData = subAgentOutputs.content_market_fit || {};
  const gapData = subAgentOutputs.competitor_gap || {};
  const brandKit = (nicheProfile.brandKit as any) || {};

  let groundedAngle = topicAngle;
  if (useKnowledge || knowledgeQuery) {
    const groundedChunks = await searchKnowledge(user.id, knowledgeQuery || topicTitle, 4);
    if (groundedChunks.length > 0) {
      groundedAngle = `${topicAngle || ''}\n\nGrounding from uploads:\n${groundedChunks
        .map((chunk) => `- ${chunk.fileName}: ${chunk.content.slice(0, 220)}`)
        .join('\n')}`.trim();
    }
  }

  const result = await generateContentWithProvider({
    apiKey: activeProvider.apiKey,
    provider: provider as any,
    model: resolvedModel,
    niche: nicheProfile.niche,
    topic: {
      title: topicTitle,
      angle: groundedAngle,
    },
    platform,
    tone: nicheProfile.tone,
    seoKeywords: (seoData.keywords as string[]) || (scoredTopic?.seoKeywords as string[]) || [],
    seoHashtags:
      platform === 'linkedin'
        ? (seoData.hashtags_linkedin as string[]) || (scoredTopic?.seoHashtags as string[]) || []
        : (seoData.hashtags_x as string[]) || (scoredTopic?.seoHashtags as string[]) || [],
    audiencePersonas:
      (audienceData.persona_match as string[]) || (scoredTopic?.audiencePersonas as string[]) || [],
    ctaService: (cmfData.linked_service as string) || scoredTopic?.cmfLinkedService || undefined,
    competitorAngle:
      (gapData.differentiation_angle as string) || scoredTopic?.competitorDiffAngle || undefined,
    examplePosts: (nicheProfile.examplePosts as string[]) || [],
    learnedPatterns: brandKit.learned_patterns,
    baseUrl: activeProvider.baseUrl ?? undefined,
  });

  return NextResponse.json({
    success: true,
    provider,
    model: resolvedModel,
    content: result,
  });
}
