import { pgEnum } from 'drizzle-orm/pg-core';

export const onboardingStepEnum = pgEnum('onboarding_step', [
  '1',
  '2',
  '3',
  '4',
  '5',
  'complete',
]);

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'admin']);

export const aiProviderEnum = pgEnum('ai_provider', [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'mistral',
  'replicate',
]);

export const consensusTierEnum = pgEnum('consensus_tier', [
  'definitive',
  'strong',
  'confirmed',
  'experimental',
]);

export const platformEnum = pgEnum('social_platform', [
  'linkedin',
  'x',
  'instagram',
  'facebook',
  'tiktok',
  'threads',
  'bluesky',
]);

export const connectionHealthEnum = pgEnum('connection_health', [
  'healthy',
  'degraded',
  'expired',
  'disconnected',
]);

export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'generating',
  'review',
  'scheduled',
  'publishing',
  'published',
  'failed',
]);

export const errorCategoryEnum = pgEnum('error_category', [
  'INVALID_KEY',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'TOKEN_EXPIRED',
  'DATA_NOT_FOUND',
  'NETWORK_ERROR',
  'INTERNAL_ERROR',
]);
