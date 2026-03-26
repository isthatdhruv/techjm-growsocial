export function buildSEOPrompt(
  topic: { title: string; angle: string },
  _platform: string,
  niche: string,
): string {
  return `You are an SEO and social media discoverability expert for ${niche}.

Topic: "${topic.title}"
Angle: "${topic.angle || 'General coverage'}"
Primary platforms: LinkedIn and X (Twitter)

## Your Analysis (Search Demand Analysis)
1. Keyword potential: What keywords related to this topic are people searching for?
2. Hashtag strategy: What hashtags would maximize discoverability on LinkedIn and X?
3. Algorithm favorability: Would LinkedIn/X algorithms boost this content? (trending topics, engagement patterns)
4. Search volume signal: Is this topic being actively searched right now?

## Output — respond with ONLY this JSON:
{
  "seo_score": <number 1-10, where 10 = maximum discoverability>,
  "hashtags_linkedin": [<3-5 hashtags optimized for LinkedIn, WITHOUT # prefix>],
  "hashtags_x": [<1-2 hashtags optimized for X, WITHOUT # prefix>],
  "keywords": [<5-8 SEO keywords related to this topic>],
  "trending_signal": <number 1-5, where 5 = actively trending in search>,
  "algorithm_boost_likelihood": "<low|medium|high — will platforms boost this content?>"
}`;
}
