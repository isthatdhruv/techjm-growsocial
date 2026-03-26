// === Provider Enum ===
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'deepseek' | 'mistral' | 'replicate';

// === Adapter Capabilities (returned by testConnection) ===
export interface AdapterCapabilities {
  valid: boolean;
  provider: AIProvider;
  web_search: boolean;
  x_search: boolean;
  image_gen: boolean;
  available_models: string[];
  error?: string;
}

// === Discovered Topic (output of discoverTopics) ===
export interface DiscoveredTopic {
  title: string;
  angle: string;
  source_urls: string[];
  x_post_urls?: string[];
  x_engagement?: {
    likes: number;
    replies: number;
    reposts: number;
  };
  why_timely: string;
  controversy_level: number;
  suggested_platform: 'linkedin' | 'x' | 'both';
}

// === Grounding Item (from fallback scrapers) ===
export interface GroundingItem {
  source: string;
  title: string;
  url: string;
  description: string;
  score: number;
  timestamp: string;
}

// === Niche Context (input to discoverTopics) ===
export interface NicheContext {
  niche: string;
  pillars: string[];
  audience: string;
  tone: string;
  competitors: { handle: string; platform: string }[];
  anti_topics: string[];
  recent_topics: string[];
  grounding_data?: GroundingItem[];
}

// === Sub-Agent Types ===
export type SubAgentType =
  | 'sentiment'
  | 'audience_fit'
  | 'seo'
  | 'competitor_gap'
  | 'content_market_fit'
  | 'engagement_predictor'
  | 'pillar_balancer';

export interface SubAgentResult {
  agent_type: SubAgentType;
  scores: Record<string, number | boolean | string | string[]>;
  raw_output: string;
}

// === Caption Generation ===
export interface CaptionRequest {
  topic_title: string;
  topic_angle: string;
  platform: 'linkedin' | 'x';
  seo_keywords: string[];
  seo_hashtags: string[];
  audience_personas: string[];
  cta_service?: string;
  competitor_angle?: string;
  tone: string;
  example_posts: string[];
  learned_patterns?: any;
}

export interface CaptionResult {
  caption: string;
  hashtags: string[];
  estimated_word_count: number;
}

// === Image Generation ===
export interface ImagePromptResult {
  prompt: string;
  style: string;
  negative_prompt?: string;
}

export interface ImageGenResult {
  image_url: string;
  width: number;
  height: number;
}

// === The Unified Adapter Interface ===
export interface AIAdapter {
  provider: AIProvider;

  testConnection(apiKey: string): Promise<AdapterCapabilities>;

  discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]>;

  analyzeSubAgent(
    apiKey: string,
    model: string,
    topic: DiscoveredTopic,
    agentType: SubAgentType,
    nicheContext: NicheContext,
    historicalData?: any,
  ): Promise<SubAgentResult>;

  generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult>;

  generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult>;

  generateImage(
    apiKey: string,
    model: string,
    prompt: string,
    options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult>;
}
