import { Mistral } from '@mistralai/mistralai';
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
} from '../types';
import { parseJsonResponse, mapApiError } from '../utils';
import { buildDiscoveryPrompt } from '../prompts/discovery';
import { buildSubAgentPrompt } from '../prompts/sub-agent';
import { buildCaptionPrompt, buildImagePromptPrompt } from '../prompts/caption';

export class MistralAdapter implements AIAdapter {
  provider = 'mistral' as const;

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const client = new Mistral({ apiKey });
      const modelsResponse = await client.models.list();
      const availableModels: string[] = [];
      if (modelsResponse.data) {
        for (const model of modelsResponse.data) {
          availableModels.push(model.id);
        }
      }

      return {
        valid: true,
        provider: 'mistral',
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: availableModels,
      };
    } catch (err) {
      return {
        valid: false,
        provider: 'mistral',
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: [],
        error: mapApiError(err, 'Mistral'),
      };
    }
  }

  async discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    try {
      const client = new Mistral({ apiKey });
      const systemPrompt = buildDiscoveryPrompt(context, false);

      const response = await client.chat.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Discover trending topics based on the provided data.' },
        ],
      });

      const text = response.choices?.[0]?.message?.content as string;
      return parseJsonResponse<DiscoveredTopic[]>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Mistral'));
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
      const client = new Mistral({ apiKey });
      const systemPrompt = buildSubAgentPrompt(agentType, topic, nicheContext, historicalData);

      const response = await client.chat.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this topic as the ${agentType} sub-agent.` },
        ],
        temperature: 0.3,
      });

      const rawOutput = response.choices?.[0]?.message?.content as string;
      const scores = parseJsonResponse<Record<string, number | boolean | string | string[]>>(rawOutput);

      return {
        agent_type: agentType,
        scores,
        raw_output: rawOutput,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'Mistral'));
    }
  }

  async generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult> {
    try {
      const client = new Mistral({ apiKey });
      const systemPrompt = buildCaptionPrompt(request);

      const response = await client.chat.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the caption now.' },
        ],
        temperature: 0.7,
      });

      const rawOutput = response.choices?.[0]?.message?.content as string;
      return parseJsonResponse<CaptionResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, 'Mistral'));
    }
  }

  async generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult> {
    try {
      const client = new Mistral({ apiKey });
      const systemPrompt = buildImagePromptPrompt(caption, brandKit);

      const response = await client.chat.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate the image prompt now.' },
        ],
        temperature: 0.7,
      });

      const rawOutput = response.choices?.[0]?.message?.content as string;
      return parseJsonResponse<ImagePromptResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, 'Mistral'));
    }
  }

  async generateImage(
    _apiKey: string,
    _model: string,
    _prompt: string,
    _options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    throw new Error('Mistral does not support image generation');
  }
}
