import { AdapterFactory } from './factory.js';
import type { AIProvider, CaptionResult } from './types.js';

export interface GenerateContentInput {
  apiKey: string;
  provider: AIProvider;
  model: string;
  niche: string;
  topic: {
    title: string;
    angle?: string | null;
  };
  platform?: 'linkedin' | 'x';
  tone?: string;
  audiencePersonas?: string[];
  seoKeywords?: string[];
  seoHashtags?: string[];
  examplePosts?: string[];
  competitorAngle?: string;
  ctaService?: string;
  learnedPatterns?: unknown;
  baseUrl?: string;
}

export async function generateContent({
  apiKey,
  provider,
  model,
  niche,
  topic,
  platform = 'linkedin',
  tone = 'clear, credible, and audience-aware',
  audiencePersonas = [],
  seoKeywords = [],
  seoHashtags = [],
  examplePosts = [],
  competitorAngle,
  ctaService,
  learnedPatterns,
  baseUrl,
}: GenerateContentInput): Promise<CaptionResult> {
  const adapter = AdapterFactory.getAdapter(provider, { baseUrl });

  return adapter.generateCaption(apiKey, model, {
    niche,
    topic_title: topic.title,
    topic_angle: topic.angle ?? '',
    platform,
    seo_keywords: seoKeywords,
    seo_hashtags: seoHashtags,
    audience_personas: audiencePersonas,
    cta_service: ctaService,
    competitor_angle: competitorAngle,
    tone,
    example_posts: examplePosts,
    learned_patterns: learnedPatterns,
  });
}
