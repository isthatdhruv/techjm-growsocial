import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { db, scoredTopics, scoringWeights } from '@techjm/db';
import { eq } from 'drizzle-orm';
import { connection } from '../../redis.js';
import { QUEUE_NAMES } from '../../queues.js';
import { withErrorHandling } from '../../lib/error-handler.js';
import type { ScoringOrchestratorJobData } from '../../queues.js';

// Default weights from architecture doc Section 5.2
const DEFAULT_WEIGHTS: Record<string, number> = {
  sentiment: 0.15,
  audience_fit: 0.2,
  seo: 0.15,
  competitor_gap: 0.15,
  content_market_fit: 0.2,
  engagement_pred: 0.15,
};

async function processScoringOrchestrator(job: Job<ScoringOrchestratorJobData>) {
  const { userId, scoredTopicId } = job.data;

  job.log(`Orchestrator: computing final score for scored_topic=${scoredTopicId}`);

  // 1. Load the scored topic with all sub-agent results
  const scored = await db.query.scoredTopics.findFirst({
    where: eq(scoredTopics.id, scoredTopicId),
  });
  if (!scored) throw new Error(`Scored topic ${scoredTopicId} not found`);

  // 2. Load user's custom weights (or use defaults)
  const userWeights = await db.query.scoringWeights.findMany({
    where: eq(scoringWeights.userId, userId),
  });

  const weights = { ...DEFAULT_WEIGHTS };
  for (const w of userWeights) {
    if (weights[w.dimension] !== undefined) {
      weights[w.dimension] = parseFloat(w.weight);
    }
  }

  // 3. Compute composite score
  // Sentiment: convert from -1..1 range to 0..10 safety score
  const rawSentiment = parseFloat(scored.sentimentScore || '0');
  let sentimentSafe = (rawSentiment + 1) * 5; // -1..1 → 0..10
  if (scored.sentimentRiskFlag) {
    sentimentSafe = Math.min(sentimentSafe, 3.0);
  }

  const audienceFit = parseFloat(scored.audienceFitScore || '5');
  const seo = parseFloat(scored.seoScore || '5');
  const competitorGap = parseFloat(scored.competitorGapScore || '5');
  const cmf = parseFloat(scored.cmfScore || '5');

  // Engagement prediction: normalize to 0-10 scale
  const predLikes = scored.engagementPredLikes || 0;
  const predComments = scored.engagementPredComments || 0;
  const predConfidence = parseFloat(scored.engagementPredConfidence || '0.5');
  const engagementRaw = predLikes + predComments * 3;
  // Blend prediction with base of 5, weighted by confidence
  const engagementNormalized =
    Math.min(10, engagementRaw / 10) * predConfidence + 5 * (1 - predConfidence);

  const pillarBoost = parseFloat(scored.pillarBoost || '1.0');
  const consensusMultiplier = parseFloat(scored.consensusMultiplier || '1.0');

  // Weighted sum
  const baseScore =
    weights.sentiment * sentimentSafe +
    weights.audience_fit * audienceFit +
    weights.seo * seo +
    weights.competitor_gap * competitorGap +
    weights.content_market_fit * cmf +
    weights.engagement_pred * engagementNormalized;

  // Apply multipliers
  const finalScore = baseScore * pillarBoost * consensusMultiplier;

  job.log(
    `Score breakdown: sentiment=${sentimentSafe.toFixed(1)}, audience=${audienceFit}, seo=${seo}, gap=${competitorGap}, cmf=${cmf}, engagement=${engagementNormalized.toFixed(1)}`,
  );
  job.log(`Multipliers: pillar=${pillarBoost}, consensus=${consensusMultiplier}`);
  job.log(
    `Final score: ${baseScore.toFixed(3)} x ${pillarBoost} x ${consensusMultiplier} = ${finalScore.toFixed(3)}`,
  );

  // 4. Update scored_topics with final score
  await db
    .update(scoredTopics)
    .set({
      finalScore: finalScore.toFixed(3),
      status: 'pending', // Ready for user review
      scoredAt: new Date(),
    })
    .where(eq(scoredTopics.id, scoredTopicId));

  return {
    scoredTopicId,
    finalScore: parseFloat(finalScore.toFixed(3)),
    breakdown: {
      sentimentSafe,
      audienceFit,
      seo,
      competitorGap,
      cmf,
      engagementNormalized,
      pillarBoost,
      consensusMultiplier,
    },
    weights,
  };
}

export const scoringOrchestratorWorker = new Worker(
  QUEUE_NAMES.SCORING_ORCHESTRATOR,
  withErrorHandling('scoring-orchestrator', processScoringOrchestrator),
  { connection, concurrency: 10 },
);

scoringOrchestratorWorker.on('failed', (job, err) => {
  console.error(
    `[scoring-orchestrator] Job failed for scored_topic=${job?.data?.scoredTopicId}`,
    err.message,
  );
});
