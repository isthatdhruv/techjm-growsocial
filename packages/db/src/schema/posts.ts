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
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { scoredTopics } from './scoring';
import { platformEnum, postStatusEnum } from './_enums';

export { postStatusEnum };

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
