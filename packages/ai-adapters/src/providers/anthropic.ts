import Anthropic from '@anthropic-ai/sdk';
import type {
  AIAdapter,
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

function extractTextContent(response: Anthropic.Message): string {
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  if (textBlocks.length === 0) {
    throw new Error('No text content in Anthropic response');
  }
  return textBlocks[textBlocks.length - 1].text;
}

export class AnthropicAdapter implements AIAdapter {
  provider = 'anthropic' as const;

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return {
        valid: true,
        provider: 'anthropic',
        web_search: true,
        x_search: false,
        image_gen: false,
        available_models: [
          'claude-3-5-sonnet-20241022',
          'claude-haiku-4-5-20251001',
          'claude-opus-4-6-20250610',
        ],
      };
    } catch (err) {
      return {
        valid: false,
        provider: 'anthropic',
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: [],
        error: mapApiError(err, 'Anthropic'),
      };
    }
  }

  async discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    try {
      const client = new Anthropic({ apiKey });
      const systemPrompt = buildDiscoveryPrompt(context, true);

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: [
          {
            type: 'web_search_20250305' as const,
            name: 'web_search' as const,
            max_uses: 5,
          } as any,
        ],
        messages: [{ role: 'user', content: 'Discover trending topics now.' }],
      });

      const text = extractTextContent(response);
      return parseJsonResponse<DiscoveredTopic[]>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Anthropic'));
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
      const client = new Anthropic({ apiKey });
      const systemPrompt = buildSubAgentPrompt(agentType, topic, nicheContext, historicalData);

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analyze this topic as the ${agentType} sub-agent.`,
          },
        ],
      });

      const text = extractTextContent(response);
      const scores = parseJsonResponse<Record<string, number | boolean | string | string[]>>(text);

      return {
        agent_type: agentType,
        scores,
        raw_output: text,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'Anthropic'));
    }
  }

  async generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult> {
    try {
      const client = new Anthropic({ apiKey });
      const systemPrompt = buildCaptionPrompt(request);

      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Generate the caption now.',
          },
        ],
      });

      const text = extractTextContent(response);
      return parseJsonResponse<CaptionResult>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Anthropic'));
    }
  }

  async generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult> {
    try {
      const client = new Anthropic({ apiKey });
      const systemPrompt = buildImagePromptPrompt(caption, brandKit);

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Generate the image prompt now.',
          },
        ],
      });

      const text = extractTextContent(response);
      return parseJsonResponse<ImagePromptResult>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Anthropic'));
    }
  }

  async generateImage(
    _apiKey: string,
    _model: string,
    _prompt: string,
    _options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    throw new Error('Anthropic does not support image generation');
  }
}
