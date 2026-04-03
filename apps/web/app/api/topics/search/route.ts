import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, rawTopics, scoredTopics, userNicheProfiles, selectTextModel } from '@techjm/db';
import { searchKnowledge } from '@/lib/knowledge';
import { getAvailableProvidersForUser, getResolvedKeyForProvider } from '@/lib/ai-key-resolver';
import { generateStructuredObjectWithProvider } from '@/lib/ai-provider';
import { v4 as uuidv4 } from 'uuid';
import { queueTopicScoring } from '@/lib/topic-scoring';

export const dynamic = 'force-dynamic';

interface GeneratedTopicIdea {
  title: string;
  angle: string;
  reasoning: string;
  suggestedPlatform?: 'linkedin' | 'x' | 'both';
  controversyLevel?: number;
}

const DEFAULT_TEXT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-2.0-flash',
  xai: 'grok-2-latest',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-large-latest',
  groq: 'llama-3.3-70b-versatile',
  openai_compatible: 'gpt-4o-mini',
};

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const query = String(body?.query || '').trim();
  const source = String(body?.source || 'both');

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  console.info(`[topics/search] start user=${user.id} source=${source} query="${query}"`);

  let topicMatches = source === 'uploads'
    ? []
    : await db
        .select({
          id: sql<string>`COALESCE(${scoredTopics.id}, ${rawTopics.id})`,
          rawTopicId: rawTopics.id,
          status: sql<string>`COALESCE(${scoredTopics.status}, 'pending')`,
          finalScore: scoredTopics.finalScore,
          sentimentScore: scoredTopics.sentimentScore,
          sentimentRiskFlag: scoredTopics.sentimentRiskFlag,
          audienceFitScore: scoredTopics.audienceFitScore,
          audiencePersonas: scoredTopics.audiencePersonas,
          seoScore: scoredTopics.seoScore,
          seoHashtags: scoredTopics.seoHashtags,
          seoKeywords: scoredTopics.seoKeywords,
          competitorGapScore: scoredTopics.competitorGapScore,
          competitorDiffAngle: scoredTopics.competitorDiffAngle,
          cmfScore: scoredTopics.cmfScore,
          cmfLinkedService: scoredTopics.cmfLinkedService,
          cmfCtaNatural: scoredTopics.cmfCtaNatural,
          engagementPredLikes: scoredTopics.engagementPredLikes,
          engagementPredComments: scoredTopics.engagementPredComments,
          engagementPredConfidence: scoredTopics.engagementPredConfidence,
          pillarBoost: scoredTopics.pillarBoost,
          consensusMultiplier: scoredTopics.consensusMultiplier,
          subAgentOutputs: scoredTopics.subAgentOutputs,
          scoredAt: scoredTopics.scoredAt,
          title: rawTopics.title,
          angle: rawTopics.angle,
          reasoning: rawTopics.reasoning,
          sourceUrls: rawTopics.sourceUrls,
          xPostUrls: rawTopics.xPostUrls,
          consensusTier: rawTopics.consensusTier,
          consensusCount: rawTopics.consensusCount,
          sourceLlm: rawTopics.sourceLlm,
          provider: rawTopics.provider,
          model: rawTopics.model,
          controversyLevel: rawTopics.controversyLevel,
          suggestedPlatform: rawTopics.suggestedPlatform,
        })
        .from(rawTopics)
        .leftJoin(
          scoredTopics,
          and(eq(scoredTopics.rawTopicId, rawTopics.id), eq(scoredTopics.userId, user.id)),
        )
        .where(
          and(
            eq(rawTopics.userId, user.id),
            or(
              ilike(rawTopics.title, `%${query}%`),
              ilike(rawTopics.angle, `%${query}%`),
              ilike(rawTopics.reasoning, `%${query}%`),
              ilike(rawTopics.sourceLlm, `%${query}%`),
            ),
          ),
        )
        .orderBy(desc(rawTopics.fetchedAt))
        .limit(10);

  const uploadMatches =
    source === 'topics' ? [] : await searchKnowledge(user.id, query, 6);

  console.info(
    `[topics/search] db results user=${user.id} topicMatches=${topicMatches.length} uploadMatches=${uploadMatches.length}`,
  );

  let generatedCount = 0;
  let message: string | null = null;

  if (source !== 'uploads' && topicMatches.length === 0) {
    const nicheProfile = await db.query.userNicheProfiles.findFirst({
      where: eq(userNicheProfiles.userId, user.id),
    });

    const provider = (await getAvailableProvidersForUser(user.id)).find(
      (candidate) => candidate.provider !== 'replicate',
    );

    if (!provider) {
      message = 'No saved topics matched and no AI provider is configured for fallback search.';
      console.warn(`[topics/search] no provider available for fallback user=${user.id}`);
    } else {
      const activeKey = await getResolvedKeyForProvider(user.id, provider.provider);

      if (!activeKey) {
        message = `No usable API key found for ${provider.provider}.`;
        console.warn(`[topics/search] provider key missing user=${user.id} provider=${provider.provider}`);
      } else {
        const model = selectTextModel(
          provider.provider,
          provider.models,
          provider.models[0] || DEFAULT_TEXT_MODELS[provider.provider] || 'gpt-4o-mini',
        );

        console.info(
          `[topics/search] fallback generation user=${user.id} provider=${provider.provider} model=${model}`,
        );

        const prompt = `You are generating timely social media topic ideas for a user search query.

User niche: ${nicheProfile?.niche || 'General professional content'}
Search query: ${query}
Audience: ${nicheProfile?.audience || 'Professionals and decision-makers'}
Tone: ${nicheProfile?.tone || 'Professional'}
Content pillars: ${((nicheProfile?.pillars as string[] | null) || []).join(', ') || 'None provided'}

Return ONLY valid JSON as an array of up to 5 items:
[
  {
    "title": "short topic title",
    "angle": "specific post angle",
    "reasoning": "why this matters now or why this is useful",
    "suggestedPlatform": "linkedin",
    "controversyLevel": 1
  }
]

Rules:
- Center every idea on the search query
- Make the ideas specific and usable as post topics
- Keep suggestedPlatform one of: linkedin, x, both
- controversyLevel must be 1 to 5`;

        try {
          const generatedTopics = await generateStructuredObjectWithProvider<GeneratedTopicIdea[]>({
            apiKey: activeKey.apiKey,
            provider: provider.provider as any,
            model,
            prompt,
            baseUrl: activeKey.baseUrl ?? undefined,
          });

          const validGeneratedTopics = (generatedTopics || [])
            .filter((topic) => topic?.title?.trim())
            .slice(0, 5);

          console.info(
            `[topics/search] generated user=${user.id} provider=${provider.provider} count=${validGeneratedTopics.length}`,
          );

          if (validGeneratedTopics.length > 0) {
            const discoveryRunId = uuidv4();
            const insertedTopics = await db
              .insert(rawTopics)
              .values(
                validGeneratedTopics.map((topic) => ({
                  userId: user.id,
                  sourceLlm: 'manual_search',
                  provider: provider.provider as any,
                  model,
                  title: topic.title.trim(),
                  angle: topic.angle?.trim() || null,
                  reasoning: topic.reasoning?.trim() || null,
                  sourceUrls: [],
                  xPostUrls: null,
                  consensusCount: 1,
                  consensusTier: 'experimental' as const,
                  controversyLevel: topic.controversyLevel ?? 1,
                  suggestedPlatform: topic.suggestedPlatform || 'linkedin',
                  discoveryRunId,
                  fetchedAt: new Date(),
                  xEngagement: null,
                })),
              )
              .returning({
                id: rawTopics.id,
                title: rawTopics.title,
                angle: rawTopics.angle,
                reasoning: rawTopics.reasoning,
                sourceUrls: rawTopics.sourceUrls,
                xPostUrls: rawTopics.xPostUrls,
                consensusTier: rawTopics.consensusTier,
                consensusCount: rawTopics.consensusCount,
                sourceLlm: rawTopics.sourceLlm,
                provider: rawTopics.provider,
                model: rawTopics.model,
                controversyLevel: rawTopics.controversyLevel,
                suggestedPlatform: rawTopics.suggestedPlatform,
              });

            const insertedScores = await db
              .insert(scoredTopics)
              .values(
                insertedTopics.map((topic) => ({
                  rawTopicId: topic.id,
                  userId: user.id,
                  status: 'scoring',
                  consensusMultiplier: '1.00',
                })),
              )
              .returning({
                id: scoredTopics.id,
                rawTopicId: scoredTopics.rawTopicId,
                status: scoredTopics.status,
                finalScore: scoredTopics.finalScore,
                sentimentScore: scoredTopics.sentimentScore,
                sentimentRiskFlag: scoredTopics.sentimentRiskFlag,
                audienceFitScore: scoredTopics.audienceFitScore,
                audiencePersonas: scoredTopics.audiencePersonas,
                seoScore: scoredTopics.seoScore,
                seoHashtags: scoredTopics.seoHashtags,
                seoKeywords: scoredTopics.seoKeywords,
                competitorGapScore: scoredTopics.competitorGapScore,
                competitorDiffAngle: scoredTopics.competitorDiffAngle,
                cmfScore: scoredTopics.cmfScore,
                cmfLinkedService: scoredTopics.cmfLinkedService,
                cmfCtaNatural: scoredTopics.cmfCtaNatural,
                engagementPredLikes: scoredTopics.engagementPredLikes,
                engagementPredComments: scoredTopics.engagementPredComments,
                engagementPredConfidence: scoredTopics.engagementPredConfidence,
                pillarBoost: scoredTopics.pillarBoost,
                consensusMultiplier: scoredTopics.consensusMultiplier,
                subAgentOutputs: scoredTopics.subAgentOutputs,
                scoredAt: scoredTopics.scoredAt,
              });

            const scoringResult = await queueTopicScoring(
              user.id,
              insertedTopics.map((topic) => {
                const scored = insertedScores.find((item) => item.rawTopicId === topic.id);
                return {
                  rawTopicId: topic.id,
                  scoredTopicId: scored?.id || '',
                  discoveryRunId,
                };
              }).filter((item) => Boolean(item.scoredTopicId)),
            );

            topicMatches = insertedTopics.map((topic) => {
              const scored = insertedScores.find((item) => item.rawTopicId === topic.id);
              return {
                id: scored?.id || topic.id,
                rawTopicId: topic.id,
                status: scored?.status || 'pending',
                finalScore: scored?.finalScore || null,
                sentimentScore: scored?.sentimentScore || null,
                sentimentRiskFlag: scored?.sentimentRiskFlag || null,
                audienceFitScore: scored?.audienceFitScore || null,
                audiencePersonas: scored?.audiencePersonas || null,
                seoScore: scored?.seoScore || null,
                seoHashtags: scored?.seoHashtags || null,
                seoKeywords: scored?.seoKeywords || null,
                competitorGapScore: scored?.competitorGapScore || null,
                competitorDiffAngle: scored?.competitorDiffAngle || null,
                cmfScore: scored?.cmfScore || null,
                cmfLinkedService: scored?.cmfLinkedService || null,
                cmfCtaNatural: scored?.cmfCtaNatural || null,
                engagementPredLikes: scored?.engagementPredLikes || null,
                engagementPredComments: scored?.engagementPredComments || null,
                engagementPredConfidence: scored?.engagementPredConfidence || null,
                pillarBoost: scored?.pillarBoost || null,
                consensusMultiplier: scored?.consensusMultiplier || '1.00',
                subAgentOutputs: scored?.subAgentOutputs || null,
                scoredAt: scored?.scoredAt || null,
                title: topic.title,
                angle: topic.angle,
                reasoning: topic.reasoning,
                sourceUrls: topic.sourceUrls,
                xPostUrls: topic.xPostUrls,
                consensusTier: topic.consensusTier,
                consensusCount: topic.consensusCount,
                sourceLlm: topic.sourceLlm,
                provider: topic.provider,
                model: topic.model,
                controversyLevel: topic.controversyLevel,
                suggestedPlatform: topic.suggestedPlatform,
              };
            });

            generatedCount = topicMatches.length;
            message = `Generated ${generatedCount} new topic idea${generatedCount === 1 ? '' : 's'} for "${query}".`;
            console.info(
              `[topics/search] saved fallback topics user=${user.id} count=${generatedCount} scoringQueued=${scoringResult.queued}`,
            );
          } else {
            message = `No saved topics matched "${query}", and AI fallback produced no valid topic ideas.`;
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown fallback generation error';
          console.error(
            `[topics/search] fallback generation failed user=${user.id} provider=${provider.provider}: ${errorMessage}`,
          );
          return NextResponse.json(
            {
              error: `Search fallback failed: ${errorMessage}`,
            },
            { status: 500 },
          );
        }
      }
    }
  }

  console.info(
    `[topics/search] complete user=${user.id} topicMatches=${topicMatches.length} uploadMatches=${uploadMatches.length} generated=${generatedCount}`,
  );

  return NextResponse.json({
    query,
    source,
    topics: topicMatches,
    uploads: uploadMatches,
    generatedCount,
    message,
  });
}
