import { OpenAICompatibleAdapter } from './openai-compatible.js';

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor() {
    super({
      baseURL: 'https://api.groq.com/openai/v1',
      providerName: 'Groq',
      providerId: 'groq',
    });
  }
}
