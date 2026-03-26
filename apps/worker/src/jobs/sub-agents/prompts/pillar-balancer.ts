export function buildPillarBalancerPrompt(
  topic: { title: string; angle: string },
  pillars: string[],
  recentPillarDistribution: Record<string, number>,
): string {
  const distributionText =
    Object.entries(recentPillarDistribution)
      .map(([pillar, count]) => `- ${pillar}: ${count} posts`)
      .join('\n') || 'No posts yet — all pillars equally weighted';

  const totalPosts = Object.values(recentPillarDistribution).reduce((a, b) => a + b, 0);

  return `You are a content portfolio strategist using Modern Portfolio Theory for social media.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"

Content Pillars: ${pillars.join(', ')}

Recent Post Distribution (last 30 posts):
${distributionText}
Total recent posts: ${totalPosts}

## Your Analysis (Portfolio Theory — Content Diversification)
1. Pillar classification: Which content pillar does this topic belong to?
2. Balance assessment: Is this pillar overrepresented or underrepresented in recent posts?
3. Boost recommendation: Should this topic get a boost because its pillar is underserved?
4. Ideal distribution: What would a balanced distribution look like?

## Output — respond with ONLY this JSON:
{
  "primary_pillar": "<which content pillar this topic belongs to>",
  "pillar_boost": <number 0.5-2.0 where 1.0=neutral, >1.0=underrepresented pillar boost, <1.0=overrepresented penalty>,
  "current_distribution_percent": {<pillar: percentage for each pillar>},
  "ideal_distribution_percent": {<pillar: ideal percentage>},
  "balance_assessment": "<balanced|slightly_unbalanced|heavily_unbalanced>",
  "reasoning": "<1 sentence on why this boost/penalty>"
}`;
}
