export function buildCompetitorGapPrompt(
  topic: { title: string; angle: string; source_urls: string[] },
  competitors: { handle: string; platform: string }[],
  niche: string,
): string {
  const competitorList =
    competitors.length > 0
      ? competitors.map((c) => `@${c.handle} (${c.platform})`).join(', ')
      : 'No specific competitors tracked';

  return `You are a competitive intelligence analyst using Porter's Competitive Analysis for ${niche} social media.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"
Source URLs: ${topic.source_urls?.join(', ') || 'None'}

Competitors Being Tracked: ${competitorList}

## Your Analysis (Porter's Competitive Analysis)
1. Competitor coverage: Based on your knowledge, have major ${niche} accounts likely covered this topic already?
2. Saturation level: How saturated is this topic in ${niche} social media feeds?
3. Differentiation angle: What unique angle could this client take that competitors probably haven't?
4. First-mover opportunity: Is there a window to be among the first to cover this?
5. Counter-positioning: Can this be positioned as a contrarian or more nuanced take vs competitors?

## Output — respond with ONLY this JSON:
{
  "competitor_gap_score": <number 1-10, where 10 = wide open gap, no competitors covering this>,
  "likely_covered_by": [<competitor handles that probably already posted about this, empty if none>],
  "saturation_level": "<low|medium|high|oversaturated>",
  "differentiation_angle": "<specific angle that would stand out from competitor coverage>",
  "first_mover_window": "<hours remaining before this becomes saturated, e.g. '12-24 hours'>"
}`;
}
