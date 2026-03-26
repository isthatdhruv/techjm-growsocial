import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth';
import { rawTopics } from './topics';
import { posts } from './posts';

export const scoredTopics = pgTable('scored_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  rawTopicId: uuid('raw_topic_id')
    .references(() => rawTopics.id)
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  sentimentScore: numeric('sentiment_score', { precision: 4, scale: 2 }), // -1.00 to 1.00
  sentimentRiskFlag: boolean('sentiment_risk_flag').default(false),
  audienceFitScore: numeric('audience_fit_score', { precision: 3, scale: 1 }), // 1.0-10.0
  audiencePersonas: jsonb('audience_personas'), // z.array(z.string())
  seoScore: numeric('seo_score', { precision: 3, scale: 1 }),
  seoHashtags: jsonb('seo_hashtags'), // z.array(z.string())
  seoKeywords: jsonb('seo_keywords'), // z.array(z.string())
  competitorGapScore: numeric('competitor_gap_score', { precision: 3, scale: 1 }),
  competitorDiffAngle: text('competitor_diff_angle'),
  cmfScore: numeric('cmf_score', { precision: 3, scale: 1 }), // content-market fit
  cmfLinkedService: varchar('cmf_linked_service', { length: 255 }),
  cmfCtaNatural: boolean('cmf_cta_natural'),
  engagementPredLikes: integer('engagement_pred_likes'),
  engagementPredComments: integer('engagement_pred_comments'),
  engagementPredConfidence: numeric('engagement_pred_confidence', { precision: 3, scale: 2 }), // 0.00-1.00
  pillarBoost: numeric('pillar_boost', { precision: 3, scale: 2 }).default('1.00'), // 0.00-2.00
  consensusMultiplier: numeric('consensus_multiplier', { precision: 4, scale: 2 }).default('1.00'),
  finalScore: numeric('final_score', { precision: 6, scale: 3 }),
  subAgentOutputs: jsonb('sub_agent_outputs'), // Full raw output from all 7 sub-agents
  status: varchar('status', { length: 20 }).default('pending'), // pending | approved | rejected | archived
  scoredAt: timestamp('scored_at').defaultNow(),
});

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

export const scoringFeedback = pgTable('scoring_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => posts.id),
  topicId: uuid('topic_id').references(() => scoredTopics.id),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  predictedScore: numeric('predicted_score', { precision: 6, scale: 3 }),
  actualEngagement: numeric('actual_engagement', { precision: 6, scale: 3 }),
  scoreDelta: numeric('score_delta', { precision: 6, scale: 3 }),
  weightsSnapshot: jsonb('weights_snapshot'), // Snapshot of scoring_weights at time of prediction
  createdAt: timestamp('created_at').defaultNow(),
});

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

export const scoringWeights = pgTable(
  'scoring_weights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    dimension: varchar('dimension', { length: 50 }).notNull(),
    weight: numeric('weight', { precision: 4, scale: 3 }).notNull(), // 0.050 to 0.400
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [unique('scoring_weights_user_dimension_unique').on(table.userId, table.dimension)],
);

export const scoringWeightsRelations = relations(scoringWeights, ({ one }) => ({
  user: one(users, {
    fields: [scoringWeights.userId],
    references: [users.id],
  }),
}));
