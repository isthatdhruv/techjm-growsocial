import { relations } from 'drizzle-orm';
import { users } from './auth.js';
import { userNicheProfiles } from './niche.js';
import { userAiKeys, userModelConfig } from './ai-keys.js';
import { platformConnections } from './connections.js';
import { rawTopics } from './topics.js';
import { scoredTopics, scoringFeedback, scoringWeights } from './scoring.js';
import { posts, publishLog, topicPerformance } from './posts.js';
import { notificationPreferences } from './notifications.js';
import { knowledgeDocuments, knowledgeChunks, knowledgeSearchLogs } from './knowledge.js';
import { jobErrors } from './errors.js';

// ── Users ──
export const usersRelations = relations(users, ({ one, many }) => ({
  nicheProfile: one(userNicheProfiles, {
    fields: [users.id],
    references: [userNicheProfiles.userId],
  }),
  aiKeys: many(userAiKeys),
  modelConfig: one(userModelConfig, {
    fields: [users.id],
    references: [userModelConfig.userId],
  }),
  platformConnections: many(platformConnections),
  rawTopics: many(rawTopics),
  scoredTopics: many(scoredTopics),
  posts: many(posts),
  scoringWeights: many(scoringWeights),
  notificationPreferences: one(notificationPreferences, {
    fields: [users.id],
    references: [notificationPreferences.userId],
  }),
  knowledgeDocuments: many(knowledgeDocuments),
  knowledgeChunks: many(knowledgeChunks),
  knowledgeSearchLogs: many(knowledgeSearchLogs),
  jobErrors: many(jobErrors),
}));

// ── Niche ──
export const userNicheProfilesRelations = relations(userNicheProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userNicheProfiles.userId],
    references: [users.id],
  }),
}));

// ── AI Keys ──
export const userAiKeysRelations = relations(userAiKeys, ({ one }) => ({
  user: one(users, {
    fields: [userAiKeys.userId],
    references: [users.id],
  }),
}));

export const userModelConfigRelations = relations(userModelConfig, ({ one }) => ({
  user: one(users, {
    fields: [userModelConfig.userId],
    references: [users.id],
  }),
}));

// ── Platform Connections ──
export const platformConnectionsRelations = relations(platformConnections, ({ one }) => ({
  user: one(users, {
    fields: [platformConnections.userId],
    references: [users.id],
  }),
}));

// ── Raw Topics ──
export const rawTopicsRelations = relations(rawTopics, ({ one, many }) => ({
  user: one(users, {
    fields: [rawTopics.userId],
    references: [users.id],
  }),
  scoredTopics: many(scoredTopics),
}));

// ── Scored Topics ──
export const scoredTopicsRelations = relations(scoredTopics, ({ one, many }) => ({
  rawTopic: one(rawTopics, {
    fields: [scoredTopics.rawTopicId],
    references: [rawTopics.id],
  }),
  user: one(users, {
    fields: [scoredTopics.userId],
    references: [users.id],
  }),
  posts: many(posts),
  feedback: many(scoringFeedback),
}));

// ── Scoring Feedback ──
export const scoringFeedbackRelations = relations(scoringFeedback, ({ one }) => ({
  post: one(posts, {
    fields: [scoringFeedback.postId],
    references: [posts.id],
  }),
  topic: one(scoredTopics, {
    fields: [scoringFeedback.topicId],
    references: [scoredTopics.id],
  }),
  user: one(users, {
    fields: [scoringFeedback.userId],
    references: [users.id],
  }),
}));

// ── Scoring Weights ──
export const scoringWeightsRelations = relations(scoringWeights, ({ one }) => ({
  user: one(users, {
    fields: [scoringWeights.userId],
    references: [users.id],
  }),
}));

// ── Posts ──
export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  topic: one(scoredTopics, {
    fields: [posts.topicId],
    references: [scoredTopics.id],
  }),
  publishLogs: many(publishLog),
  performance: many(topicPerformance),
}));

// ── Publish Log ──
export const publishLogRelations = relations(publishLog, ({ one }) => ({
  post: one(posts, {
    fields: [publishLog.postId],
    references: [posts.id],
  }),
}));

// ── Topic Performance ──
export const topicPerformanceRelations = relations(topicPerformance, ({ one }) => ({
  post: one(posts, {
    fields: [topicPerformance.postId],
    references: [posts.id],
  }),
}));

// ── Notification Preferences ──
export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

// ── Knowledge ──
export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one, many }) => ({
  user: one(users, {
    fields: [knowledgeDocuments.userId],
    references: [users.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  user: one(users, {
    fields: [knowledgeChunks.userId],
    references: [users.id],
  }),
  document: one(knowledgeDocuments, {
    fields: [knowledgeChunks.documentId],
    references: [knowledgeDocuments.id],
  }),
}));

export const knowledgeSearchLogsRelations = relations(knowledgeSearchLogs, ({ one }) => ({
  user: one(users, {
    fields: [knowledgeSearchLogs.userId],
    references: [users.id],
  }),
}));

// ── Job Errors ──
export const jobErrorsRelations = relations(jobErrors, ({ one }) => ({
  user: one(users, {
    fields: [jobErrors.userId],
    references: [users.id],
  }),
}));
