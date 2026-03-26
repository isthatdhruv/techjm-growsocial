export function buildSentimentPrompt(
  topic: { title: string; angle: string },
  niche: string,
): string {
  return `You are a brand sentiment analyst specializing in ${niche} content strategy.

Analyze this topic for social media posting:
Title: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"

## Your Analysis (Brand Sentiment Mapping Framework)
1. Sentiment polarity: Is this topic positive, negative, or neutral for a ${niche} brand to post about?
2. Emotional charge: How emotionally charged is this topic? (calm factual update vs heated debate)
3. Risk assessment: Could posting about this damage brand reputation?
   - Political risk: touches political/partisan issues
   - Controversy risk: community is divided on this
   - Sensitivity risk: involves layoffs, health scares, tragedies
   - Misinformation risk: facts are disputed or evolving

## Output — respond with ONLY this JSON, no other text:
{
  "sentiment_score": <number from -1.0 (very negative) to 1.0 (very positive)>,
  "emotional_charge": <number from 1 (calm/factual) to 5 (highly emotional)>,
  "risk_flag": <boolean — true if ANY risk is medium-high>,
  "risk_reasons": [<list of specific risk reasons, empty array if no risks>],
  "posting_safe": <boolean — true if safe to post for a professional brand>,
  "summary": "<one sentence summary of sentiment assessment>"
}`;
}
