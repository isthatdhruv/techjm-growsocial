import { Queue, FlowProducer } from 'bullmq';
import { connection } from './redis.js';

// Queue names as constants
export const QUEUE_NAMES = {
  HEALTH_CHECK: 'health-check',
  FALLBACK_GROUNDING: 'fallback-grounding',
  DISCOVERY_CRON: 'discovery-cron',
  DISCOVERY_LLM: 'discovery-llm',
  DISCOVERY_MERGE: 'discovery-merge',
  // Phase 6: Sub-Agent Scoring Pipeline
  SUB_AGENT: 'sub-agent',
  SCORING_ORCHESTRATOR: 'scoring-orchestrator',
  // Phase 7: Content Generation Pipeline
  CAPTION_GEN: 'caption-gen',
  IMAGE_PROMPT_GEN: 'image-prompt-gen',
  IMAGE_GEN: 'image-gen',
  // Phase 8: Publishing Pipeline
  PUBLISH: 'publish',
  // Phase 9: Engagement Tracking
  ENGAGEMENT_CHECK: 'engagement-check',
  // Phase 10: Adaptive Feedback Loop
  FEEDBACK_LOOP: 'feedback-loop',
  // Phase 12: Backup
  BACKUP: 'backup',
} as const;

// Queue instances
export const healthCheckQueue = new Queue(QUEUE_NAMES.HEALTH_CHECK, { connection });
export const fallbackGroundingQueue = new Queue(QUEUE_NAMES.FALLBACK_GROUNDING, { connection });
export const discoveryCronQueue = new Queue(QUEUE_NAMES.DISCOVERY_CRON, { connection });
export const discoveryLLMQueue = new Queue(QUEUE_NAMES.DISCOVERY_LLM, { connection });
export const discoveryMergeQueue = new Queue(QUEUE_NAMES.DISCOVERY_MERGE, { connection });
export const subAgentQueue = new Queue(QUEUE_NAMES.SUB_AGENT, { connection });
export const scoringOrchestratorQueue = new Queue(QUEUE_NAMES.SCORING_ORCHESTRATOR, { connection });
export const captionGenQueue = new Queue(QUEUE_NAMES.CAPTION_GEN, { connection });
export const imagePromptGenQueue = new Queue(QUEUE_NAMES.IMAGE_PROMPT_GEN, { connection });
export const imageGenQueue = new Queue(QUEUE_NAMES.IMAGE_GEN, { connection });
export const publishQueue = new Queue(QUEUE_NAMES.PUBLISH, { connection });
export const engagementCheckQueue = new Queue(QUEUE_NAMES.ENGAGEMENT_CHECK, { connection });
export const feedbackLoopQueue = new Queue(QUEUE_NAMES.FEEDBACK_LOOP, { connection });
export const backupQueue = new Queue(QUEUE_NAMES.BACKUP, { connection });

// Flow producer for orchestrating multi-step jobs
export const flowProducer = new FlowProducer({ connection });

// Job data types
export interface FallbackGroundingJobData {
  niches: string[]; // All active niches to scrape for
}

export interface DiscoveryCronJobData {
  // Triggered by cron — no input data, discovers all active users
}

export interface DiscoveryLLMJobData {
  userId: string;
  slotName: 'slot_a' | 'slot_b' | 'slot_c' | 'slot_d';
  provider: string;
  model: string;
  discoveryRunId: string;
}

export interface DiscoveryMergeJobData {
  userId: string;
  discoveryRunId: string;
}

// Phase 6: Sub-Agent Scoring Pipeline
export interface SubAgentJobData {
  userId: string;
  rawTopicId: string;
  scoredTopicId: string;
  agentType:
    | 'sentiment'
    | 'audience_fit'
    | 'seo'
    | 'competitor_gap'
    | 'content_market_fit'
    | 'engagement_predictor'
    | 'pillar_balancer';
  provider: string;
  model: string;
}

export interface ScoringOrchestratorJobData {
  userId: string;
  scoredTopicId: string;
  rawTopicId: string;
  discoveryRunId: string;
}

// Phase 7: Content Generation Pipeline
export interface CaptionGenJobData {
  userId: string;
  scoredTopicId: string;
  rawTopicId: string;
  platforms: ('linkedin' | 'x')[];
}

export interface ImagePromptGenJobData {
  userId: string;
  scoredTopicId: string;
  linkedinPostId?: string;
  xPostId?: string;
  captionText: string;
}

export interface ImageGenJobData {
  userId: string;
  postIds: string[];
  imagePrompt: string;
  imageStyle?: string;
  provider: string;
  model: string;
}

// Phase 8: Publishing Pipeline
export interface PublishJobData {
  userId: string;
  postId: string;
  platform: 'linkedin' | 'x';
  scheduledAt: string; // ISO timestamp
  retryCount: number;
}

// Phase 10: Adaptive Feedback Loop
export interface FeedbackLoopJobData {
  userId: string
  postId: string
  platform: 'linkedin' | 'x'
  scoredTopicId: string
}

// Phase 9: Engagement Tracking
export interface EngagementCheckJobData {
  userId: string
  postId: string
  platform: 'linkedin' | 'x'
  externalId: string        // LinkedIn post URN or X tweet ID
  checkpoint: '2h' | '6h' | '24h' | '48h'
  accessTokenEnc: string    // Encrypted access token (avoid re-reading DB on each check)
  orgUrn?: string | null    // For LinkedIn org posts
}
