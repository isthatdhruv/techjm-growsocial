import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { onboardingStepEnum, planEnum } from './_enums.js';

export { onboardingStepEnum, planEnum };

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
