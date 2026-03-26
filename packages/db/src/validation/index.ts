import { z } from 'zod';

// Niche profile JSONB schemas
export const pillarsSchema = z.array(z.string()).min(3).max(6);

export const competitorsSchema = z.array(
  z.object({
    handle: z.string(),
    platform: z.enum(['linkedin', 'x']),
  }),
);

export const antiTopicsSchema = z.array(z.string());

export const examplePostsSchema = z.array(z.string()).max(3);

export const brandKitSchema = z.object({
  colors: z.array(z.string()).optional(),
  image_style: z.string().optional(),
  learned_patterns: z.any().optional(),
  optimal_times: z.any().optional(),
});

// AI keys JSONB schemas
export const capabilitiesSchema = z.object({
  web_search: z.boolean(),
  x_search: z.boolean(),
  image_gen: z.boolean(),
  models: z.array(z.string()),
});

export const slotConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

// Topics JSONB schemas
export const sourceUrlsSchema = z.array(z.string().url());

export const xEngagementSchema = z.object({
  likes: z.number(),
  replies: z.number(),
  reposts: z.number(),
});

// Scoring JSONB schemas
export const audiencePersonasSchema = z.array(z.string());

export const hashtagsSchema = z.array(z.string());

export const keywordsSchema = z.array(z.string());

export const weightsSnapshotSchema = z.record(z.string(), z.number());

// Posts JSONB schemas
export const imageUrlsSchema = z.object({
  linkedin: z.string().url().optional(),
  x: z.string().url().optional(),
});
