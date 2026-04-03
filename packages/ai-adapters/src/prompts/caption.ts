import type { CaptionRequest } from '../types.js';

export function buildCaptionPrompt(request: CaptionRequest): string {
  const platformGuidance =
    request.platform === 'linkedin'
      ? `Write a LinkedIn post (150-300 words). Use line breaks for readability. Start with a hook.
         Include a call-to-action at the end. Professional but engaging tone.`
      : `Write a tweet/X post (max 240 characters for the main text). Be punchy and concise.
         Use conversational language. Thread-worthy — make people want to engage.`;

  return `You are an expert ${request.platform === 'linkedin' ? 'LinkedIn' : 'X/Twitter'} copywriter for ${request.niche}.

## Topic
Niche: ${request.niche}
Title: ${request.topic_title}
Angle: ${request.topic_angle}

## Platform
${platformGuidance}

## Brand Voice
Tone: ${request.tone}
${request.example_posts.length > 0 ? `Example posts from this brand:\n${request.example_posts.map((p) => `- "${p}"`).join('\n')}` : ''}

## SEO Requirements
Keywords to incorporate naturally: ${request.seo_keywords.join(', ')}
Suggested hashtags: ${request.seo_hashtags.join(' ')}

## Audience
Target personas: ${request.audience_personas.join(', ')}

${request.cta_service ? `## Call-to-Action\nNaturally reference: ${request.cta_service}` : ''}
${request.competitor_angle ? `## Differentiation\nDifferentiate from competitors by: ${request.competitor_angle}` : ''}
${request.learned_patterns ? `## Learned Patterns\nPrevious high-performing patterns: ${JSON.stringify(request.learned_patterns)}` : ''}

## Output Format
Respond with ONLY JSON:
{
  "caption": "The full post text here",
  "hashtags": ["#Tag1", "#Tag2"],
  "estimated_word_count": 180
}`;
}

export function buildImagePromptPrompt(caption: string, brandKit: any): string {
  return `You are an expert visual content strategist. Generate an image prompt for a social media post.

## Post Caption
${caption}

## Brand Kit
${brandKit ? JSON.stringify(brandKit, null, 2) : 'No specific brand kit — use modern, clean aesthetics'}

## Requirements
- The image should complement the post, not repeat the text
- Style: modern, professional, eye-catching
- No text in the image (social platforms handle text overlays)
- Think about what would make someone stop scrolling

## Output Format
Respond with ONLY JSON:
{
  "prompt": "Detailed image generation prompt here",
  "style": "photographic | illustration | 3d-render | abstract",
  "negative_prompt": "things to avoid in the image"
}`;
}
