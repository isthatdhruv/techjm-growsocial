import { pgTable, pgEnum, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { userNicheProfiles } from './niche';
import { userAiKeys, userModelConfig } from './ai-keys';
import { platformConnections } from './connections';
import { rawTopics } from './topics';
import { scoredTopics, scoringWeights } from './scoring';
import { posts } from './posts';

export const onboardingStepEnum = pgEnum('onboarding_step', [
  '1',
  '2',
  '3',
  '4',
  '5',
  'complete',
]);

export const planEnum = pgEnum('plan', ['free', 'starter', 'pro', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).unique().notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  onboardingStep: onboardingStepEnum('onboarding_step').default('1').notNull(),
  plan: planEnum('plan').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
}));
