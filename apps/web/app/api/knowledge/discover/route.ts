import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { getAvailableProvidersForUser, getResolvedKeyForProvider } from '@/lib/ai-key-resolver';
import { generateStructuredObjectWithProvider } from '@/lib/ai-provider';
import { db, knowledgeDocuments, rawTopics, scoredTopics, userNicheProfiles, selectTextModel } from '@techjm/db';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { queueTopicScoring } from '@/lib/topic-scoring';

interface GeneratedTopic {
  title: string;
  angle: string;
  reasoning: string;
  keyPoints: string[];
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const query = String(body?.query || '').trim();
    const limit = Math.min(Number(body?.limit || 5), 10);
    const save = Boolean(body?.save ?? true);

    console.info(
      `[knowledge/discover] start user=${user.id} query=${query ? `"${query}"` : 'none'} save=${save}`,
    );

    const nicheProfile = await db.query.userNicheProfiles.findFirst({
      where: eq(userNicheProfiles.userId, user.id),
    });

    const documents = await db.query.knowledgeDocuments.findMany({
      where: and(eq(knowledgeDocuments.userId, user.id), eq(knowledgeDocuments.status, 'ready')),
      orderBy: [desc(knowledgeDocuments.updatedAt)],
      limit: 6,
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: 'Upload documents before running upload discovery.' }, { status: 400 });
    }

    const provider = (await getAvailableProvidersForUser(user.id)).find(
      (candidate) => candidate.provider !== 'replicate',
    );

    if (!provider) {
      return NextResponse.json(
        { error: 'No AI provider available for upload discovery. Add a user key or configure a platform key.' },
        { status: 400 },
      );
    }

    const activeKey = await getResolvedKeyForProvider(user.id, provider.provider);
    if (!activeKey) {
      return NextResponse.json({ error: 'No provider key available.' }, { status: 400 });
    }

    const selectedModel = selectTextModel(provider.provider, provider.models, provider.models[0] || 'gpt-4o-mini');

    console.info(
      `[knowledge/discover] provider user=${user.id} provider=${provider.provider} model=${selectedModel}`,
    );

    const contextText = documents
      .map((document, index) => `Document ${index + 1}: ${document.fileName}\n${(document.extractedText || '').slice(0, 1800)}`)
      .join('\n\n');

    const prompt = `You are discovering timely social content topics from a user's uploaded research.

Niche: ${nicheProfile?.niche || 'General professional content'}
Search focus: ${query || 'Find the strongest recurring themes from the uploads'}

Uploaded research:
${contextText}

Return ONLY valid JSON as an array with up to ${limit} items:
[
  {
    "title": "topic title",
    "angle": "specific angle for a social post",
    "reasoning": "why this matters now",
    "keyPoints": ["point 1", "point 2"]
  }
]`;

    const topics = await generateStructuredObjectWithProvider<GeneratedTopic[]>({
      apiKey: activeKey.apiKey,
      provider: provider.provider as any,
      model: selectedModel,
      prompt,
      baseUrl: activeKey.baseUrl ?? undefined,
    });

    console.info(`[knowledge/discover] generated user=${user.id} count=${topics.length}`);

    let saved = 0;
    if (save) {
      const rows = topics.map((topic) => ({
        userId: user.id,
        sourceLlm: 'uploads',
        provider: provider.provider as any,
        model: selectedModel,
        title: topic.title,
        angle: topic.angle,
        reasoning: topic.reasoning,
        sourceUrls: documents.map((document) => `upload://${document.id}`),
        xPostUrls: null,
        consensusCount: 1,
        consensusTier: 'experimental' as const,
        controversyLevel: null,
        suggestedPlatform: 'linkedin' as const,
        discoveryRunId: uuidv4(),
        fetchedAt: new Date(),
        xEngagement: null,
      }));

      if (rows.length > 0) {
        const insertedTopics = await db.insert(rawTopics).values(rows).returning({
          id: rawTopics.id,
          discoveryRunId: rawTopics.discoveryRunId,
        });
        const insertedScores = await db.insert(scoredTopics).values(
          insertedTopics.map((topic) => ({
            rawTopicId: topic.id,
            userId: user.id,
            status: 'scoring',
            consensusMultiplier: '1.00',
          })),
        ).returning({
          id: scoredTopics.id,
          rawTopicId: scoredTopics.rawTopicId,
        });

        const scoringResult = await queueTopicScoring(
          user.id,
          insertedTopics.map((topic) => {
            const scored = insertedScores.find((item) => item.rawTopicId === topic.id);
            return {
              rawTopicId: topic.id,
              scoredTopicId: scored?.id || '',
              discoveryRunId: topic.discoveryRunId || uuidv4(),
            };
          }).filter((item) => Boolean(item.scoredTopicId)),
        );
        saved = insertedTopics.length;
        console.info(
          `[knowledge/discover] scoring queued user=${user.id} topics=${scoringResult.queued} provider=${scoringResult.provider || 'none'} model=${scoringResult.model || 'none'}`,
        );
        console.info(`[knowledge/discover] saved user=${user.id} count=${saved}`);
      }
    }

    return NextResponse.json({
      success: true,
      topics,
      saved,
      sourceDocuments: documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[knowledge/discover] failed: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
