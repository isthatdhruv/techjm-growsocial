import type { NicheContext } from '../types';

export function formatGroundingData(items: { source: string; title: string; url: string; description: string; score: number; timestamp: string }[]): string {
  return `## Real-Time Trending Data (collected ${new Date().toISOString()})\n\n` +
    items
      .map(
        (item, i) =>
          `${i + 1}. [${item.source.toUpperCase()}] ${item.title}\n` +
          `   URL: ${item.url}\n` +
          `   ${item.description ? item.description.slice(0, 200) : ''}\n` +
          `   Score: ${item.score} | Published: ${item.timestamp}`,
      )
      .join('\n\n');
}

export function buildDiscoveryPrompt(context: NicheContext, hasWebSearch: boolean): string {
  const searchInstruction = hasWebSearch
    ? `Use your web search capability to find what's trending in ${context.niche} RIGHT NOW.
       Search for: recent news (last 48 hours), tool/product launches, industry debates,
       viral posts, conference announcements, funding rounds, regulation changes.`
    : `Analyze the real-time trending data provided below and identify the most relevant
       topics for ${context.niche}. Select the best topics, add your own angles and insights.`;

  const groundingSection = context.grounding_data?.length
    ? `\n${formatGroundingData(context.grounding_data)}`
    : '';

  return `You are an expert social media strategist specializing in ${context.niche}.

${searchInstruction}

## Your Client's Profile
- Niche: ${context.niche}
- Content Pillars: ${context.pillars.join(', ')}
- Target Audience: ${context.audience}
- Tone: ${context.tone}
- Anti-Topics (NEVER suggest these): ${context.anti_topics.join(', ') || 'None'}

## Competitor Accounts to Be Aware Of
${context.competitors.map((c) => `- @${c.handle} (${c.platform})`).join('\n') || 'None specified'}

## Topics Already Posted Recently (DO NOT repeat these)
${context.recent_topics.map((t) => `- ${t}`).join('\n') || 'None yet'}
${groundingSection}

## Your Task
Find 5-8 topics that would perform well as social media posts for this client TODAY.

## Output Format
Respond with ONLY a JSON array. No markdown, no explanation, no preamble. Just the JSON array:
[
  {
    "title": "Short punchy topic title",
    "angle": "The specific angle or take to cover this topic from",
    "source_urls": ["https://source1.com", "https://source2.com"],
    "why_timely": "Why this is relevant TODAY specifically",
    "controversy_level": 2,
    "suggested_platform": "linkedin"
  }
]

Rules:
- Each topic MUST have at least one source_url (real, verifiable link)
- controversy_level: 1=safe, 2=mild debate, 3=strong opinions, 4=provocative, 5=highly divisive
- suggested_platform: "linkedin" for professional/long-form, "x" for punchy/viral, "both" for either
- Avoid topics in the anti-topics list
- Avoid topics similar to recently posted ones
- Prioritize topics that are genuinely trending TODAY, not evergreen content`;
}

export function buildGrokDiscoveryPrompt(context: NicheContext): string {
  const base = buildDiscoveryPrompt(context, true);

  const competitorHandles = context.competitors
    .filter((c) => c.platform === 'x')
    .map((c) => `@${c.handle}`)
    .join(', ');

  return `${base}

## Additional X/Twitter Search Instructions
Also search X/Twitter for:
- Trending conversations in ${context.niche}
- Posts with high engagement (likes > 100, replies > 20) from the last 24 hours
${competitorHandles ? `- What competitor accounts (${competitorHandles}) are posting about` : ''}

For each topic, include both web source URLs and X post URLs if found.
Add x_post_urls and x_engagement fields for topics found via X search.

Extended output format for X-sourced topics:
{
  "title": "...",
  "angle": "...",
  "source_urls": ["https://..."],
  "x_post_urls": ["https://x.com/user/status/..."],
  "x_engagement": { "likes": 500, "replies": 45, "reposts": 120 },
  "why_timely": "...",
  "controversy_level": 3,
  "suggested_platform": "x"
}`;
}
