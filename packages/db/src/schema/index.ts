// Enums
export {
  onboardingStepEnum,
  planEnum,
  aiProviderEnum,
  consensusTierEnum,
  platformEnum,
  connectionHealthEnum,
  postStatusEnum,
  errorCategoryEnum,
} from './_enums.js';

// Auth
export { users } from './auth.js';

// Niche
export { userNicheProfiles } from './niche.js';

// AI Keys & Model Config
export { userAiKeys, userModelConfig } from './ai-keys.js';

// Platform Connections
export { platformConnections } from './connections.js';

// Recommendations
export { recommendationMatrix } from './recommendations.js';

// Topics
export { rawTopics, fallbackGroundingCache } from './topics.js';

// Scoring
export { scoredTopics, scoringFeedback, scoringWeights } from './scoring.js';

// Posts
export { posts, publishLog, topicPerformance } from './posts.js';

// Notifications
export { notificationPreferences } from './notifications.js';

// Knowledge
export { knowledgeDocuments, knowledgeChunks, knowledgeSearchLogs } from './knowledge.js';

// Errors
export { jobErrors } from './errors.js';

// Relations (all centralized)
export {
  usersRelations,
  userNicheProfilesRelations,
  userAiKeysRelations,
  userModelConfigRelations,
  platformConnectionsRelations,
  rawTopicsRelations,
  scoredTopicsRelations,
  scoringFeedbackRelations,
  scoringWeightsRelations,
  postsRelations,
  publishLogRelations,
  topicPerformanceRelations,
  notificationPreferencesRelations,
  knowledgeDocumentsRelations,
  knowledgeChunksRelations,
  knowledgeSearchLogsRelations,
  jobErrorsRelations,
} from './_relations.js';
