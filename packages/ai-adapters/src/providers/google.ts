import { GoogleGenerativeAI } from '@google/generative-ai';
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

export class GoogleAdapter implements AIAdapter {
  provider: AIProvider = 'google';

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // Validate the key by making a simple generation call with a known model
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent('hi');
      // If we get here, the key is valid
      const responseText = result.response.text();

      // Key validated via generateContent. List known models.
      const availableModels = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp',
      ];
      const hasImagen = false; // Imagen requires separate API access

      return {
        valid: true,
        provider: this.provider,
        web_search: true,
        x_search: false,
        image_gen: hasImagen,
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
        error: mapApiError(err, 'Google'),
      };
    }
  }

  async discoverTopics(
    apiKey: string,
    model: string,
    context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      // Use Google Search grounding for real-time discovery
      const genModel = genAI.getGenerativeModel({
        model,
        tools: [{ googleSearch: {} } as any],
      });

      const prompt = buildDiscoveryPrompt(context, true);
      const result = await genModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Extract source URLs from grounding metadata
      const chunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sourceUrls: string[] = (chunks as any[])
        .map((c: any) => c.web?.uri)
        .filter(Boolean);

      // Parse the topic JSON from the response text
      const topics = parseJsonResponse<DiscoveredTopic[]>(text);

      // Merge grounding source URLs into topics that lack them
      return topics.map((topic) => ({
        ...topic,
        source_urls:
          topic.source_urls?.length > 0
            ? topic.source_urls
            : sourceUrls.length > 0
              ? sourceUrls
              : [],
      }));
    } catch (err) {
      throw new Error(mapApiError(err, 'Google'));
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
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model });

      const prompt = buildSubAgentPrompt(
        agentType,
        topic,
        nicheContext,
        historicalData,
      );
      const result = await genModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      const scores = parseJsonResponse<Record<string, number | boolean | string | string[]>>(text);

      return {
        agent_type: agentType,
        scores,
        raw_output: text,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'Google'));
    }
  }

  async generateCaption(
    apiKey: string,
    model: string,
    request: CaptionRequest,
  ): Promise<CaptionResult> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model });

      const prompt = buildCaptionPrompt(request);
      const result = await genModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return parseJsonResponse<CaptionResult>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Google'));
    }
  }

  async generateImagePrompt(
    apiKey: string,
    model: string,
    caption: string,
    brandKit: any,
  ): Promise<ImagePromptResult> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model });

      const prompt = buildImagePromptPrompt(caption, brandKit);
      const result = await genModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return parseJsonResponse<ImagePromptResult>(text);
    } catch (err) {
      throw new Error(mapApiError(err, 'Google'));
    }
  }

  async generateImage(
    apiKey: string,
    model: string,
    prompt: string,
    options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    try {
      if (!model.toLowerCase().includes('imagen')) {
        throw new Error(
          `Model "${model}" does not support image generation. Use an Imagen model.`,
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({ model });

      const imageSize =
        options?.width && options?.height
          ? `${options.width}x${options.height}`
          : '1024x1024';

      const result = await (genModel as any).generateImages({
        prompt,
        numberOfImages: 1,
        imageSize,
      });

      const imageUrl =
        result?.images?.[0]?.url ??
        result?.images?.[0]?.uri ??
        result?.generatedImages?.[0]?.url;

      if (!imageUrl) {
        throw new Error('No image URL returned from Imagen model');
      }

      const [width, height] = imageSize.split('x').map(Number);

      return {
        image_url: imageUrl,
        width: width ?? 1024,
        height: height ?? 1024,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'Google'));
    }
  }
}
