import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { aiProviderEnum, consensusTierEnum } from './_enums';

export { consensusTierEnum };

export const rawTopics = pgTable('raw_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  sourceLlm: varchar('source_llm', { length: 20 }).notNull(), // slot_a | slot_b | slot_c | slot_d
  provider: aiProviderEnum('provider').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  angle: text('angle'),
  reasoning: text('reasoning'),
  sourceUrls: jsonb('source_urls'), // z.array(z.string().url())
  xPostUrls: jsonb('x_post_urls'), // z.array(z.string().url())
  xEngagement: jsonb('x_engagement'), // { likes, replies, reposts }
  consensusCount: integer('consensus_count').default(1),
  consensusTier: consensusTierEnum('consensus_tier'),
  controversyLevel: integer('controversy_level'), // 1-5
  suggestedPlatform: varchar('suggested_platform', { length: 20 }),
  discoveryRunId: uuid('discovery_run_id'),
  fetchedAt: timestamp('fetched_at').defaultNow(),
});

export const fallbackGroundingCache = pgTable('fallback_grounding_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 50 }).notNull(), // hackernews | reddit | rss | producthunt | devto
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
