export function buildEngagementPredictorPrompt(
  topic: { title: string; angle: string; controversy_level: number },
  niche: string,
  audience: string,
  historicalAvg?: { avg_likes: number; avg_comments: number; avg_shares: number },
): string {
  const historyContext = historicalAvg
    ? `\nHistorical Performance (client's average per post):\n- Average likes: ${historicalAvg.avg_likes}\n- Average comments: ${historicalAvg.avg_comments}\n- Average shares: ${historicalAvg.avg_shares}`
    : `\nNo historical data yet (new account). Use industry benchmarks for a ${niche} account with ~1000 followers.`;

  return `You are a social media engagement analyst using historical regression modeling for ${niche}.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"
Controversy Level: ${topic.controversy_level || 3}/5
Target Audience: ${audience}
${historyContext}

## Your Analysis (Engagement Prediction)
1. Like prediction: How many likes would this post likely get?
2. Comment prediction: How many comments? (comments = highest engagement signal)
3. Share prediction: How many shares/reposts?
4. Virality potential: Could this break out beyond the existing audience?
5. Confidence: How confident are you in this prediction?

## Output — respond with ONLY this JSON:
{
  "predicted_likes": <integer — predicted like count>,
  "predicted_comments": <integer — predicted comment count>,
  "predicted_shares": <integer — predicted share/repost count>,
  "virality_potential": "<none|low|medium|high|viral>",
  "confidence": <number 0.0-1.0, where 1.0 = very confident>,
  "reasoning": "<1-2 sentences on what drives this prediction>"
}`;
}
