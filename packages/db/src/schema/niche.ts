import { pgTable, uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth';

export const userNicheProfiles = pgTable('user_niche_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .unique()
    .notNull(),
  niche: varchar('niche', { length: 100 }).notNull(),
  pillars: jsonb('pillars').notNull(), // z.array(z.string()).min(3).max(6)
  audience: text('audience').notNull(),
  tone: varchar('tone', { length: 50 }).notNull(),
  competitors: jsonb('competitors'), // z.array(z.object({ handle, platform }))
  antiTopics: jsonb('anti_topics'), // z.array(z.string())
  examplePosts: jsonb('example_posts'), // z.array(z.string()).max(3)
  brandKit: jsonb('brand_kit'), // z.object({ colors, image_style, learned_patterns, optimal_times })
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const userNicheProfilesRelations = relations(userNicheProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userNicheProfiles.userId],
    references: [users.id],
  }),
}));
