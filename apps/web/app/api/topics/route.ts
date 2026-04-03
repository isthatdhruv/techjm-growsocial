import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { db, scoredTopics, rawTopics } from '@techjm/db';
import { eq, and, desc, ilike, or, sql, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const sort = searchParams.get('sort') || 'score';
  const search = searchParams.get('search') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Build conditions
  const conditions = [eq(scoredTopics.userId, user.id)];
  if (status !== 'all') {
    if (status === 'pending') {
      conditions.push(inArray(scoredTopics.status, ['pending', 'scoring']));
    } else {
      conditions.push(eq(scoredTopics.status, status));
    }
  }

  // Build sort
  let orderBy;
  switch (sort) {
    case 'newest':
      orderBy = desc(scoredTopics.scoredAt);
      break;
    case 'consensus':
      orderBy = desc(scoredTopics.consensusMultiplier);
      break;
    case 'score':
    default:
      orderBy = desc(scoredTopics.finalScore);
      break;
  }

  // Query scored topics joined with raw topics
  const results = await db
    .select({
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
      // Raw topic fields
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
    .from(scoredTopics)
    .innerJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(
      search
        ? and(
            ...conditions,
            or(
              ilike(rawTopics.title, `%${search}%`),
              ilike(rawTopics.angle, `%${search}%`),
              ilike(rawTopics.reasoning, `%${search}%`),
            ),
          )
        : and(...conditions),
    )
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(scoredTopics)
    .innerJoin(rawTopics, eq(scoredTopics.rawTopicId, rawTopics.id))
    .where(
      search
        ? and(
            ...conditions,
            or(
              ilike(rawTopics.title, `%${search}%`),
              ilike(rawTopics.angle, `%${search}%`),
              ilike(rawTopics.reasoning, `%${search}%`),
            ),
          )
        : and(...conditions),
    );

  return NextResponse.json({
    topics: results,
    total: Number(countResult?.count || 0),
    limit,
    offset,
  });
}
