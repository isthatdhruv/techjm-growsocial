export { db } from './client.js';

// Re-export everything
export * from './schema/index.js';
export { encrypt, decrypt, encryptApiKey, decryptApiKey } from './encryption.js';
export {
  getActiveApiKey,
  getAvailableAiProviders,
  isLikelyImageModel,
  selectImageModel,
  selectTextModel,
} from './ai-provider-config.js';
export type { SupportedAIProvider, ProviderConfig } from './ai-provider-config.js';
