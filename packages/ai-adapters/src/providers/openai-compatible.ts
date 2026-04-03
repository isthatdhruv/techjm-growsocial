import OpenAI from 'openai';
import type {
  AIAdapter,
  AIProvider,
  AdapterCapabilities,
  CaptionRequest,
  CaptionResult,
  DiscoveredTopic,
  ImageGenResult,
  ImagePromptResult,
  NicheContext,
  SubAgentResult,
  SubAgentType,
} from '../types.js';
import { parseJsonResponse, mapApiError } from '../utils.js';
import { buildDiscoveryPrompt } from '../prompts/discovery.js';
import { buildSubAgentPrompt } from '../prompts/sub-agent.js';
import { buildCaptionPrompt, buildImagePromptPrompt } from '../prompts/caption.js';

interface CompatibleConfig {
  baseURL: string;
  providerName?: string;
  providerId?: AIProvider;
}

export class OpenAICompatibleAdapter implements AIAdapter {
  provider: AIProvider;

  constructor(private readonly config: CompatibleConfig) {
    this.provider = config.providerId ?? 'openai_compatible';
  }

  private getClient(apiKey: string) {
    return new OpenAI({ apiKey, baseURL: this.config.baseURL });
  }

  private getProviderName() {
    return this.config.providerName ?? 'OpenAI-compatible provider';
  }

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const client = this.getClient(apiKey);
      const modelsPage = await client.models.list();
      const availableModels: string[] = [];
      for await (const model of modelsPage) {
        availableModels.push(model.id);
      }

      return {
        valid: true,
        provider: this.provider,
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: availableModels,
      };
    } catch (err) {
      return {
        valid: false,
        provider: this.provider,
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: [],
        error: mapApiError(err, this.getProviderName()),
      };
    }
  }

  async discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    try {
      const client = this.getClient(apiKey);
      const systemPrompt = buildDiscoveryPrompt(context, false);
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Discover timely topics based on the provided niche context.' },
        ],
        temperature: 0.4,
      });

      const text = response.choices[0]?.message?.content ?? '';
      return parseJsonResponse<DiscoveredTopic[]>(text);
    } catch (err) {
      throw new Error(mapApiError(err, this.getProviderName()));
    }
  }

  async analyzeSubAgent(
    apiKey: string,
    model: string,
    topic: DiscoveredTopic,
    agentType: SubAgentType,
    nicheContext: NicheContext,
    historicalData?: any,
  ): Promise<SubAgentResult> {
    try {
      const client = this.getClient(apiKey);
      const systemPrompt = buildSubAgentPrompt(agentType, topic, nicheContext, historicalData);
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this topic as the ${agentType} sub-agent.` },
        ],
        temperature: 0.3,
      });

      const rawOutput = response.choices[0]?.message?.content ?? '';
      const scores = parseJsonResponse<Record<string, number | boolean | string | string[]>>(rawOutput);

      return {
        agent_type: agentType,
        scores,
        raw_output: rawOutput,
      };
    } catch (err) {
      throw new Error(mapApiError(err, this.getProviderName()));
    }
  }

  async generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult> {
    try {
      const client = this.getClient(apiKey);
      const systemPrompt = buildCaptionPrompt(request);
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the caption now.' },
        ],
        temperature: 0.7,
      });

      const rawOutput = response.choices[0]?.message?.content ?? '';
      return parseJsonResponse<CaptionResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, this.getProviderName()));
    }
  }

  async generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult> {
    try {
      const client = this.getClient(apiKey);
      const systemPrompt = buildImagePromptPrompt(caption, brandKit);
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the image prompt now.' },
        ],
        temperature: 0.7,
      });

      const rawOutput = response.choices[0]?.message?.content ?? '';
      return parseJsonResponse<ImagePromptResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, this.getProviderName()));
    }
  }

  async generateImage(
    _apiKey: string,
    _model: string,
    _prompt: string,
    _options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    throw new Error(`${this.getProviderName()} does not support image generation here`);
  }
}
