export const NICHE_CATEGORIES = [
  'Technology',
  'AI & Machine Learning',
  'SaaS & Startups',
  'Marketing & Growth',
  'Finance & Fintech',
  'Health & Wellness',
  'E-commerce',
  'Education',
  'Real Estate',
  'Crypto & Web3',
  'Creator Economy',
  'Remote Work',
  'Sustainability',
  'Cybersecurity',
  'Design & UX',
] as const;

export type NicheCategory = (typeof NICHE_CATEGORIES)[number];

export const TONE_OPTIONS = [
  'Professional',
  'Casual',
  'Thought Leader',
  'Humorous',
  'Educational',
  'Inspirational',
  'Conversational',
  'Provocative',
  'Data-Driven',
  'Storytelling',
] as const;

export type ToneOption = (typeof TONE_OPTIONS)[number];

export const PLATFORMS = {
  LINKEDIN: 'linkedin',
  X: 'x',
  THREADS: 'threads',
  BLUESKY: 'bluesky',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];

export const AI_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  XAI: 'xai',
  DEEPSEEK: 'deepseek',
  REPLICATE: 'replicate',
} as const;

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

export const SUB_AGENTS = [
  'virality',
  'brand-fit',
  'audience',
  'timing',
  'sentiment',
  'competition',
  'engagement',
] as const;

export type SubAgent = (typeof SUB_AGENTS)[number];
