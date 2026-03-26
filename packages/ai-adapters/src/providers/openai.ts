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
} from '../types';
import { parseJsonResponse, mapApiError } from '../utils';
import { buildDiscoveryPrompt } from '../prompts/discovery';
import { buildSubAgentPrompt } from '../prompts/sub-agent';
import { buildCaptionPrompt, buildImagePromptPrompt } from '../prompts/caption';

export class OpenAIAdapter implements AIAdapter {
  provider: AIProvider = 'openai';

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const client = new OpenAI({ apiKey });
      const modelsPage = await client.models.list();
      const availableModels: string[] = [];
      for await (const model of modelsPage) {
        availableModels.push(model.id);
      }

      const imageGen = availableModels.some((id) => id.includes('gpt-image'));

      return {
        valid: true,
        provider: 'openai',
        web_search: true,
        x_search: false,
        image_gen: imageGen,
        available_models: availableModels,
      };
    } catch (err) {
      return {
        valid: false,
        provider: 'openai',
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: [],
        error: mapApiError(err, 'OpenAI'),
      };
    }
  }

  async discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    try {
      const client = new OpenAI({ apiKey });
      const prompt = buildDiscoveryPrompt(context, true);

      const response = await client.responses.create({
        model,
        tools: [{ type: 'web_search_preview' as const }],
        input: prompt,
      });

      const topics = parseJsonResponse<DiscoveredTopic[]>(response.output_text);

      // Extract URL citations from response output items with annotations
      const citations: string[] = [];
      for (const item of response.output) {
        if (item.type === 'message' && 'content' in item) {
          for (const content of item.content as any[]) {
            if (content.annotations) {
              for (const annotation of content.annotations) {
                if (annotation.url) {
                  citations.push(annotation.url);
                }
              }
            }
          }
        }
      }

      // Merge citations into topics that have empty source_urls
      if (citations.length > 0) {
        for (const topic of topics) {
          if (!topic.source_urls || topic.source_urls.length === 0) {
            topic.source_urls = citations.slice(0, 2);
          }
        }
      }

      return topics;
    } catch (err) {
      throw new Error(mapApiError(err, 'OpenAI'));
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
      const client = new OpenAI({ apiKey });
      const prompt = buildSubAgentPrompt(agentType, topic, nicheContext, historicalData);

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
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
      throw new Error(mapApiError(err, 'OpenAI'));
    }
  }

  async generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult> {
    try {
      const client = new OpenAI({ apiKey });
      const prompt = buildCaptionPrompt(request);

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const rawOutput = response.choices[0]?.message?.content ?? '';
      return parseJsonResponse<CaptionResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, 'OpenAI'));
    }
  }

  async generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult> {
    try {
      const client = new OpenAI({ apiKey });
      const prompt = buildImagePromptPrompt(caption, brandKit);

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const rawOutput = response.choices[0]?.message?.content ?? '';
      return parseJsonResponse<ImagePromptResult>(rawOutput);
    } catch (err) {
      throw new Error(mapApiError(err, 'OpenAI'));
    }
  }

  async generateImage(
    apiKey: string,
    model: string,
    prompt: string,
    options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    try {
      const client = new OpenAI({ apiKey });
      const width = options?.width ?? 1024;
      const height = options?.height ?? 1024;

      const response = await client.images.generate({
        model,
        prompt,
        size: `${width}x${height}` as any,
      });

      const firstImage = response.data?.[0];
      const imageUrl = firstImage?.url ?? firstImage?.b64_json ?? '';

      return {
        image_url: imageUrl,
        width,
        height,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'OpenAI'));
    }
  }
}
