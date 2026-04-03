import Replicate from 'replicate';
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
import { mapApiError } from '../utils.js';

const TEXT_ONLY_ERROR = 'Replicate is for image generation only. Use a text model provider for discovery.';

export class ReplicateAdapter implements AIAdapter {
  provider = 'replicate' as const;

  async testConnection(apiKey: string): Promise<AdapterCapabilities> {
    try {
      const client = new Replicate({ auth: apiKey });
      await client.models.get('black-forest-labs', 'flux-pro');

      return {
        valid: true,
        provider: 'replicate',
        web_search: false,
        x_search: false,
        image_gen: true,
        available_models: [
          'black-forest-labs/flux-2-pro',
          'black-forest-labs/flux-2-schnell',
        ],
      };
    } catch (err) {
      return {
        valid: false,
        provider: 'replicate',
        web_search: false,
        x_search: false,
        image_gen: false,
        available_models: [],
        error: mapApiError(err, 'Replicate'),
      };
    }
  }

  async discoverTopics(
    _apiKey: string,
    _model: string,
    _context: NicheContext,
  ): Promise<DiscoveredTopic[]> {
    throw new Error(TEXT_ONLY_ERROR);
  }

  async analyzeSubAgent(
    _apiKey: string,
    _model: string,
    _topic: DiscoveredTopic,
    _agentType: SubAgentType,
    _nicheContext: NicheContext,
    _historicalData?: any,
  ): Promise<SubAgentResult> {
    throw new Error(TEXT_ONLY_ERROR);
  }

  async generateCaption(
    _apiKey: string,
    _model: string,
    _request: CaptionRequest,
  ): Promise<CaptionResult> {
    throw new Error(TEXT_ONLY_ERROR);
  }

  async generateImagePrompt(
    _apiKey: string,
    _model: string,
    _caption: string,
    _brandKit: any,
  ): Promise<ImagePromptResult> {
    throw new Error(TEXT_ONLY_ERROR);
  }

  async generateImage(
    apiKey: string,
    model: string,
    prompt: string,
    options?: { width?: number; height?: number; style?: string },
  ): Promise<ImageGenResult> {
    try {
      const client = new Replicate({ auth: apiKey });
      const width = options?.width || 1024;
      const height = options?.height || 1024;

      const result = await client.run(model as `${string}/${string}`, {
        input: {
          prompt,
          width,
          height,
        },
      });

      // Result can be a URL string or an array of URLs
      const imageUrl = Array.isArray(result) ? result[0] : result;

      return {
        image_url: imageUrl as string,
        width,
        height,
      };
    } catch (err) {
      throw new Error(mapApiError(err, 'Replicate'));
    }
  }
}
