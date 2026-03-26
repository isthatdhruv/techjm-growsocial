export function buildContentMarketFitPrompt(
  topic: { title: string; angle: string },
  niche: string,
  audience: string,
  pillars: string[],
): string {
  return `You are a content-market fit strategist using BCG Matrix principles for ${niche}.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"
Client's Niche: ${niche}
Client's Audience: ${audience}
Client's Content Pillars: ${pillars.join(', ')}

## Your Analysis (Content-Market Fit / BCG Matrix)
1. Service alignment: Does this topic naturally lead to the client's services or expertise?
2. CTA naturalness: Can a call-to-action be embedded WITHOUT feeling forced?
3. Authority signal: Does posting about this establish the client as an authority?
4. Lead potential: Could this post directly or indirectly generate leads?
5. Pillar growth: Is this a "star" topic (high growth, high share) or "question mark" (experimental)?

## Output — respond with ONLY this JSON:
{
  "cmf_score": <number 1-10, where 10 = perfect content-market fit>,
  "linked_service": "<which of the client's services/expertise areas this naturally connects to>",
  "cta_natural": <boolean — can a CTA be naturally embedded?>,
  "cta_suggestion": "<specific CTA that would feel natural, e.g. 'Want us to audit your API design? DM us.'>",
  "authority_signal": <number 1-5, where 5 = strongly establishes authority>,
  "bcg_quadrant": "<star|cash_cow|question_mark|dog>"
}`;
}
