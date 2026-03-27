import { db, scoredTopics, scoringWeights, topicPerformance, posts } from '@techjm/db'
import { eq, and, desc } from 'drizzle-orm'
import { Job } from 'bullmq'

const DIMENSIONS = [
  'sentiment',
  'audience_fit',
  'seo',
  'competitor_gap',
  'content_market_fit',
  'engagement_pred',
] as const

export const DEFAULT_WEIGHTS: Record<string, number> = {
  sentiment: 0.15,
  audience_fit: 0.2,
  seo: 0.15,
  competitor_gap: 0.15,
  content_market_fit: 0.2,
  engagement_pred: 0.15,
}

const MIN_WEIGHT = 0.05
const MAX_WEIGHT = 0.4
const LEARNING_RATE = 0.05

export interface WeightAdjustResult {
  adjusted: boolean
  changes: Record<string, { old: number; new: number; direction: string }>
}

export async function updateScoringWeights(userId: string, job: Job): Promise<WeightAdjustResult> {
  // 1. Load last 50 posts with both sub-agent scores and actual engagement
  const dataPoints = await db
    .select({
      sentimentScore: scoredTopics.sentimentScore,
      audienceFitScore: scoredTopics.audienceFitScore,
      seoScore: scoredTopics.seoScore,
      competitorGapScore: scoredTopics.competitorGapScore,
      cmfScore: scoredTopics.cmfScore,
      engagementPredConfidence: scoredTopics.engagementPredConfidence,
      actualEngagement: topicPerformance.engagementScore,
    })
    .from(scoredTopics)
    .innerJoin(posts, eq(posts.topicId, scoredTopics.id))
    .innerJoin(
      topicPerformance,
      and(eq(topicPerformance.postId, posts.id), eq(topicPerformance.checkpoint, '48h')),
    )
    .where(eq(scoredTopics.userId, userId))
    .orderBy(desc(posts.publishedAt))
    .limit(50)

  if (dataPoints.length < 10) {
    job.log('Not enough data points for weight adjustment')
    return { adjusted: false, changes: {} }
  }

  // 2. Compute Pearson correlation between each dimension and actual engagement
  const actualScores = dataPoints.map((d) => parseFloat(d.actualEngagement || '0'))

  const correlations: Record<string, number> = {}

  for (const dim of DIMENSIONS) {
    const dimScores = dataPoints.map((d) => {
      switch (dim) {
        case 'sentiment': {
          const raw = parseFloat(d.sentimentScore || '0')
          return (raw + 1) * 5 // Convert -1..1 to 0..10
        }
        case 'audience_fit':
          return parseFloat(d.audienceFitScore || '5')
        case 'seo':
          return parseFloat(d.seoScore || '5')
        case 'competitor_gap':
          return parseFloat(d.competitorGapScore || '5')
        case 'content_market_fit':
          return parseFloat(d.cmfScore || '5')
        case 'engagement_pred':
          return parseFloat(d.engagementPredConfidence || '0.5') * 10
        default:
          return 5
      }
    })

    correlations[dim] = pearsonCorrelation(dimScores, actualScores)
  }

  job.log(
    `Correlations: ${JSON.stringify(
      Object.fromEntries(Object.entries(correlations).map(([k, v]) => [k, v.toFixed(3)])),
    )}`,
  )

  // 3. Load current weights
  const currentWeightRows = await db.query.scoringWeights.findMany({
    where: eq(scoringWeights.userId, userId),
  })

  const currentWeights: Record<string, number> = { ...DEFAULT_WEIGHTS }
  for (const row of currentWeightRows) {
    currentWeights[row.dimension] = parseFloat(row.weight)
  }

  // 4. Adjust weights based on correlation
  const avgCorrelation =
    Object.values(correlations).reduce((a, b) => a + b, 0) / DIMENSIONS.length

  const newWeights: Record<string, number> = {}
  const changes: Record<string, { old: number; new: number; direction: string }> = {}

  for (const dim of DIMENSIONS) {
    const corr = correlations[dim]
    const adjustment = LEARNING_RATE * (corr - avgCorrelation)
    let newWeight = currentWeights[dim] + adjustment
    newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight))
    newWeights[dim] = newWeight

    const direction =
      newWeight > currentWeights[dim] ? '↑' : newWeight < currentWeights[dim] ? '↓' : '→'
    changes[dim] = {
      old: currentWeights[dim],
      new: parseFloat(newWeight.toFixed(3)),
      direction,
    }
  }

  // 5. Normalize weights to sum to 1.0
  const totalWeight = Object.values(newWeights).reduce((a, b) => a + b, 0)
  for (const dim of DIMENSIONS) {
    newWeights[dim] = newWeights[dim] / totalWeight
  }

  // 6. Save updated weights
  let anyChanged = false
  for (const dim of DIMENSIONS) {
    const rounded = parseFloat(newWeights[dim].toFixed(3))
    if (Math.abs(rounded - currentWeights[dim]) > 0.001) {
      anyChanged = true

      await db
        .insert(scoringWeights)
        .values({
          userId,
          dimension: dim,
          weight: rounded.toFixed(3),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [scoringWeights.userId, scoringWeights.dimension],
          set: {
            weight: rounded.toFixed(3),
            updatedAt: new Date(),
          },
        })
    }
  }

  if (anyChanged) {
    job.log(
      `Weights updated: ${JSON.stringify(
        Object.fromEntries(
          DIMENSIONS.map((d) => [
            d,
            `${currentWeights[d].toFixed(3)} → ${newWeights[d].toFixed(3)} ${changes[d].direction}`,
          ]),
        ),
      )}`,
    )
  } else {
    job.log('Weights unchanged (correlations stable)')
  }

  return { adjusted: anyChanged, changes }
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 3) return 0

  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denomX = 0
  let denomY = 0

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    numerator += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }

  const denominator = Math.sqrt(denomX * denomY)
  if (denominator === 0) return 0

  return numerator / denominator
}
