import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth';
import { platformEnum } from './connections';
import { scoredTopics } from './scoring';

export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'generating',
  'review',
  'scheduled',
  'publishing',
  'published',
  'failed',
]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  topicId: uuid('topic_id').references(() => scoredTopics.id),
  platform: platformEnum('platform').notNull(),
  caption: text('caption').notNull(),
  hashtags: jsonb('hashtags'), // z.array(z.string())
  imagePrompt: text('image_prompt'),
  imageUrl: text('image_url'), // Cloudinary CDN URL
  imageUrls: jsonb('image_urls'), // Platform-specific variants { linkedin, x }
  status: postStatusEnum('status').default('draft').notNull(),
  scheduledAt: timestamp('scheduled_at'),
  publishedAt: timestamp('published_at'),
  externalId: varchar('external_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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

export const publishLog = pgTable('publish_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .references(() => posts.id)
    .notNull(),
  platform: platformEnum('platform').notNull(),
  attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
  success: boolean('success').notNull(),
  externalId: varchar('external_id', { length: 255 }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
});

export const publishLogRelations = relations(publishLog, ({ one }) => ({
  post: one(posts, {
    fields: [publishLog.postId],
    references: [posts.id],
  }),
}));

export const topicPerformance = pgTable('topic_performance', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .references(() => posts.id)
    .notNull(),
  platform: platformEnum('platform').notNull(),
  impressions: integer('impressions').default(0),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  engagementScore: numeric('engagement_score', { precision: 8, scale: 4 }),
  checkpoint: varchar('checkpoint', { length: 10 }).notNull(), // 2h | 6h | 24h | 48h
  measuredAt: timestamp('measured_at').defaultNow(),
});

export const topicPerformanceRelations = relations(topicPerformance, ({ one }) => ({
  post: one(posts, {
    fields: [topicPerformance.postId],
    references: [posts.id],
  }),
}));
