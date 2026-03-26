export function buildAudienceFitPrompt(
  topic: { title: string; angle: string },
  audience: string,
  pillars: string[],
  niche: string,
): string {
  return `You are an audience strategist using TAM/SAM/SOM segmentation for ${niche} social media.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"

Target Audience: ${audience}
Content Pillars: ${pillars.join(', ')}

## Your Analysis (TAM/SAM Segmentation)
1. Relevance: How relevant is this topic to the defined target audience?
2. Interest level: Would this audience actively engage (like, comment, share) with this content?
3. Persona match: Which specific personas within the audience would care most?
4. Scroll-stop power: Would this make the target audience stop scrolling in their feed?
5. Pillar alignment: Which content pillar(s) does this topic fall under?

## Output — respond with ONLY this JSON:
{
  "audience_fit_score": <number 1-10, where 10 = perfect audience match>,
  "persona_match": [<list of specific personas this resonates with, e.g. "engineering managers", "SaaS founders">],
  "pillar_alignment": [<which content pillars this topic matches>],
  "scroll_stop_power": <number 1-5, where 5 = guaranteed engagement>,
  "reasoning": "<2-3 sentences explaining why this score>"
}`;
}
