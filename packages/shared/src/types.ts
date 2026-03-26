import type { AIProvider, NicheCategory, Platform, SubAgent, ToneOption } from './constants.js';

export interface UserProfile {
  id: string;
  firebaseUid: string;
  email: string;
  displayName?: string;
  niche: NicheCategory;
  tone: ToneOption;
  platforms: Platform[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicScore {
  subAgent: SubAgent;
  score: number;
  reasoning: string;
}

export interface ScoredTopic {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  compositeScore: number;
  scores: TopicScore[];
  discoveredBy: AIProvider;
  discoveredAt: Date;
}

export interface GeneratedContent {
  id: string;
  topicId: string;
  platform: Platform;
  body: string;
  mediaPrompt?: string;
  mediaUrl?: string;
  status: 'draft' | 'approved' | 'scheduled' | 'published' | 'failed';
  scheduledAt?: Date;
  publishedAt?: Date;
}

export interface APIKey {
  provider: AIProvider;
  encryptedKey: string;
  isValid: boolean;
  lastValidated?: Date;
}

export interface JobPayload {
  userId: string;
  type: 'discovery' | 'scoring' | 'generation' | 'publishing';
  data: Record<string, unknown>;
}
