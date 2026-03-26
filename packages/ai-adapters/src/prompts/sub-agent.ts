import type { DiscoveredTopic, SubAgentType, NicheContext } from '../types';

export function buildSubAgentPrompt(
  agentType: SubAgentType,
  topic: DiscoveredTopic,
  context: NicheContext,
  historicalData?: any,
): string {
  const topicBlock = `## Topic
Title: ${topic.title}
Angle: ${topic.angle}
Sources: ${topic.source_urls.join(', ')}
Why Timely: ${topic.why_timely}
Controversy Level: ${topic.controversy_level}/5
Suggested Platform: ${topic.suggested_platform}`;

  const nicheBlock = `## Niche Context
Niche: ${context.niche}
Pillars: ${context.pillars.join(', ')}
Audience: ${context.audience}
Tone: ${context.tone}`;

  const prompts: Record<SubAgentType, string> = {
    sentiment: `You are a sentiment analysis expert. Analyze the topic below for brand safety and sentiment risk.

${topicBlock}
${nicheBlock}

Evaluate:
1. Overall sentiment of the topic in public discourse (-1.0 to 1.0)
2. Whether posting about this could damage the brand (risk_flag: true/false)
3. Potential backlash scenarios

Respond with ONLY JSON:
{
  "sentiment_score": 0.3,
  "risk_flag": false,
  "risk_reason": "Topic is generally positive with mild debate potential"
}`,

    audience_fit: `You are an audience analysis expert. Score how well this topic fits the target audience.

${topicBlock}
${nicheBlock}

Evaluate:
1. Relevance to target audience (1.0-10.0)
2. Which audience personas would engage most
3. Expected engagement level

Respond with ONLY JSON:
{
  "audience_fit_score": 8.5,
  "personas": ["CTOs", "Engineering Managers", "DevOps leads"],
  "engagement_reason": "Directly relevant to daily pain points"
}`,

    seo: `You are an SEO and social media optimization expert. Generate optimal hashtags and keywords for this topic.

${topicBlock}
${nicheBlock}

Generate:
1. SEO score (1.0-10.0) based on search volume and competition
2. 5-10 relevant hashtags (with # prefix)
3. 5-8 SEO keywords for discoverability

Respond with ONLY JSON:
{
  "seo_score": 7.5,
  "hashtags": ["#SaaS", "#ProductLaunch", "#TechNews"],
  "keywords": ["saas trends", "product launch strategy"]
}`,

    competitor_gap: `You are a competitive analysis expert. Evaluate how this topic differentiates from competitor content.

${topicBlock}
${nicheBlock}
Competitors: ${context.competitors.map((c) => `@${c.handle} (${c.platform})`).join(', ') || 'None specified'}

Evaluate:
1. Competitor gap score (1.0-10.0) — higher means competitors haven't covered this
2. Specific differentiating angle to take

Respond with ONLY JSON:
{
  "competitor_gap_score": 7.0,
  "diff_angle": "Focus on implementation details that competitors skip"
}`,

    content_market_fit: `You are a content-market fit analyst. Evaluate how well this topic connects to a product/service CTA.

${topicBlock}
${nicheBlock}

Evaluate:
1. Content-market fit score (1.0-10.0)
2. Which service/product could be naturally linked
3. Whether a CTA would feel natural or forced

Respond with ONLY JSON:
{
  "cmf_score": 6.5,
  "linked_service": "Our API monitoring tool",
  "cta_natural": true
}`,

    engagement_predictor: `You are a social media engagement prediction expert. Predict engagement metrics for this topic.

${topicBlock}
${nicheBlock}
${historicalData ? `## Historical Performance Data\n${JSON.stringify(historicalData, null, 2)}` : ''}

Predict:
1. Expected likes count
2. Expected comments count
3. Confidence level (0.00-1.00)

Respond with ONLY JSON:
{
  "predicted_likes": 150,
  "predicted_comments": 25,
  "confidence": 0.65
}`,

    pillar_balancer: `You are a content strategy expert. Evaluate which content pillar this topic belongs to and score the pillar boost.

${topicBlock}
${nicheBlock}

Evaluate:
1. Which pillar this topic best aligns with
2. Pillar boost multiplier (0.50-2.00): >1.0 if this pillar is underrepresented recently, <1.0 if overrepresented
3. Cross-pillar relevance

Respond with ONLY JSON:
{
  "primary_pillar": "Product Innovation",
  "pillar_boost": 1.25,
  "cross_pillars": ["Industry Trends"]
}`,
  };

  return prompts[agentType];
}
