export interface DiscoveredTopic {
  title: string;
  summary: string;
  keywords: string[];
  sourceUrl?: string;
  relevanceScore?: number;
  discoveredBy: string;
  discoveredAt: Date;
}

export interface AdapterCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  maxTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
}

export interface AIAdapter {
  name: string;
  capabilities: AdapterCapabilities;
  discoverTopics(niche: string, count: number): Promise<DiscoveredTopic[]>;
}
