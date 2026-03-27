import { db, posts, topicPerformance, userNicheProfiles } from '@techjm/db'
import { eq, and, desc } from 'drizzle-orm'
import { Job } from 'bullmq'

interface CaptionLearnerResult {
  patternsFound: number
  patterns: LearnedPatterns
}

export interface LearnedPatterns {
  top_hooks: { type: string; example: string; avg_engagement: number }[]
  top_ctas: { text: string; avg_engagement: number }[]
  optimal_length: { platform: string; min: number; max: number; best: number }[]
  hashtag_performance: { count: number; avg_engagement: number }[]
}

export async function learnCaptionPatterns(
  userId: string,
  job: Job,
): Promise<CaptionLearnerResult> {
  // 1. Load top 20 performing posts with their captions
  const topPosts = await db
    .select({
      caption: posts.caption,
      platform: posts.platform,
      hashtags: posts.hashtags,
      engagementScore: topicPerformance.engagementScore,
      likes: topicPerformance.likes,
      comments: topicPerformance.comments,
      shares: topicPerformance.shares,
    })
    .from(posts)
    .innerJoin(
      topicPerformance,
      and(eq(topicPerformance.postId, posts.id), eq(topicPerformance.checkpoint, '48h')),
    )
    .where(eq(posts.userId, userId))
    .orderBy(desc(topicPerformance.engagementScore))
    .limit(20)

  if (topPosts.length < 5) {
    job.log('Not enough posts for caption learning')
    return { patternsFound: 0, patterns: emptyPatterns() }
  }

  // 2. Analyze hook types (first sentence classification)
  const hookAnalysis = topPosts.map((p) => {
    const firstLine = (p.caption || '').split('\n')[0].trim()
    const hookType = classifyHook(firstLine)
    return {
      type: hookType,
      example: firstLine.slice(0, 100),
      engagement: parseFloat(p.engagementScore || '0'),
    }
  })

  const hookGroups: Record<string, { examples: string[]; engagements: number[] }> = {}
  for (const h of hookAnalysis) {
    if (!hookGroups[h.type]) hookGroups[h.type] = { examples: [], engagements: [] }
    hookGroups[h.type].examples.push(h.example)
    hookGroups[h.type].engagements.push(h.engagement)
  }

  const topHooks = Object.entries(hookGroups)
    .map(([type, data]) => ({
      type,
      example: data.examples[0],
      avg_engagement: data.engagements.reduce((a, b) => a + b, 0) / data.engagements.length,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)
    .slice(0, 5)

  // 3. Analyze CTA patterns (last 2 sentences)
  const ctaAnalysis = topPosts.map((p) => {
    const lines = (p.caption || '').split('\n').filter((l) => l.trim())
    const lastLines = lines.slice(-2).join(' ').trim()
    return {
      text: lastLines.slice(0, 150),
      engagement: parseFloat(p.engagementScore || '0'),
    }
  })

  const topCtas = ctaAnalysis
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5)
    .map((c) => ({ text: c.text, avg_engagement: c.engagement }))

  // 4. Optimal caption length per platform
  const lengthByPlatform: Record<string, { lengths: number[]; engagements: number[] }> = {}
  for (const p of topPosts) {
    const platform = p.platform || 'unknown'
    const wordCount = (p.caption || '').split(/\s+/).length
    if (!lengthByPlatform[platform])
      lengthByPlatform[platform] = { lengths: [], engagements: [] }
    lengthByPlatform[platform].lengths.push(wordCount)
    lengthByPlatform[platform].engagements.push(parseFloat(p.engagementScore || '0'))
  }

  const optimalLength = Object.entries(lengthByPlatform).map(([platform, data]) => {
    const sorted = data.lengths
      .map((l, i) => ({ length: l, eng: data.engagements[i] }))
      .sort((a, b) => b.eng - a.eng)
    return {
      platform,
      min: Math.min(...data.lengths),
      max: Math.max(...data.lengths),
      best: sorted[0]?.length || 0,
    }
  })

  // 5. Hashtag count performance
  const hashtagPerf: Record<number, number[]> = {}
  for (const p of topPosts) {
    const count = Array.isArray(p.hashtags) ? (p.hashtags as string[]).length : 0
    if (!hashtagPerf[count]) hashtagPerf[count] = []
    hashtagPerf[count].push(parseFloat(p.engagementScore || '0'))
  }

  const hashtagPerformance = Object.entries(hashtagPerf)
    .map(([count, engagements]) => ({
      count: parseInt(count),
      avg_engagement: engagements.reduce((a, b) => a + b, 0) / engagements.length,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement)

  // 6. Compile patterns
  const patterns: LearnedPatterns = {
    top_hooks: topHooks,
    top_ctas: topCtas,
    optimal_length: optimalLength,
    hashtag_performance: hashtagPerformance,
  }

  // 7. Save to user's brand kit
  const niche = await db.query.userNicheProfiles.findFirst({
    where: eq(userNicheProfiles.userId, userId),
  })

  if (niche) {
    const currentBrandKit = (niche.brandKit as Record<string, unknown>) || {}
    const updatedBrandKit = {
      ...currentBrandKit,
      learned_patterns: patterns,
      patterns_updated_at: new Date().toISOString(),
    }

    await db
      .update(userNicheProfiles)
      .set({ brandKit: updatedBrandKit, updatedAt: new Date() })
      .where(eq(userNicheProfiles.userId, userId))

    job.log(
      `Saved ${topHooks.length} hook patterns, ${topCtas.length} CTA patterns to brand_kit`,
    )
  }

  return { patternsFound: topHooks.length + topCtas.length, patterns }
}

function classifyHook(firstLine: string): string {
  const lower = firstLine.toLowerCase()

  if (lower.includes('?')) return 'question'
  if (/\d+%|\d+x|\$[\d,]+/.test(lower)) return 'statistic'
  if (/unpopular opinion|hot take|controversial|most people|nobody talks/.test(lower))
    return 'contrarian'
  if (/i just|i spent|last week|yesterday|my experience/.test(lower)) return 'story'
  if (/here's|thread|breakdown|guide|how to|step/.test(lower)) return 'educational'
  if (/stop |don't |never |myth|wrong/.test(lower)) return 'bold_claim'
  return 'general'
}

function emptyPatterns(): LearnedPatterns {
  return { top_hooks: [], top_ctas: [], optimal_length: [], hashtag_performance: [] }
}
