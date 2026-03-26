import { Queue, FlowProducer } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null as null,
};

export const QUEUE_NAMES = {
  FALLBACK_GROUNDING: 'fallback-grounding',
  DISCOVERY_CRON: 'discovery-cron',
  DISCOVERY_LLM: 'discovery-llm',
  DISCOVERY_MERGE: 'discovery-merge',
  SUB_AGENT: 'sub-agent',
  SCORING_ORCHESTRATOR: 'scoring-orchestrator',
  CAPTION_GEN: 'caption-gen',
  IMAGE_PROMPT_GEN: 'image-prompt-gen',
  IMAGE_GEN: 'image-gen',
  PUBLISH: 'publish',
} as const;

export const fallbackGroundingQueue = new Queue(QUEUE_NAMES.FALLBACK_GROUNDING, { connection });
export const discoveryLLMQueue = new Queue(QUEUE_NAMES.DISCOVERY_LLM, { connection });
export const discoveryMergeQueue = new Queue(QUEUE_NAMES.DISCOVERY_MERGE, { connection });
export const captionGenQueue = new Queue(QUEUE_NAMES.CAPTION_GEN, { connection });
export const imageGenQueue = new Queue(QUEUE_NAMES.IMAGE_GEN, { connection });
export const publishQueue = new Queue(QUEUE_NAMES.PUBLISH, { connection });
export const flowProducer = new FlowProducer({ connection });

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

export interface PublishJobData {
  userId: string;
  postId: string;
  platform: 'linkedin' | 'x';
  scheduledAt: string;
  retryCount: number;
}
