import { pgTable, uuid, varchar, text, numeric, timestamp } from 'drizzle-orm/pg-core';
import { aiProviderEnum } from './_enums';

export const recommendationMatrix = pgTable('recommendation_matrix', {
  id: uuid('id').primaryKey().defaultRandom(),
  niche: varchar('niche', { length: 100 }).unique().notNull(),
  slotAProvider: aiProviderEnum('slot_a_provider').notNull(),
  slotAModel: varchar('slot_a_model', { length: 100 }).notNull(),
  slotBProvider: aiProviderEnum('slot_b_provider').notNull(),
  slotBModel: varchar('slot_b_model', { length: 100 }).notNull(),
  slotCProvider: aiProviderEnum('slot_c_provider').notNull(),
  slotCModel: varchar('slot_c_model', { length: 100 }).notNull(),
  slotDProvider: aiProviderEnum('slot_d_provider').notNull(),
  slotDModel: varchar('slot_d_model', { length: 100 }).notNull(),
  subAgentProvider: aiProviderEnum('sub_agent_provider').notNull(),
  subAgentModel: varchar('sub_agent_model', { length: 100 }).notNull(),
  captionProvider: aiProviderEnum('caption_provider').notNull(),
  captionModel: varchar('caption_model', { length: 100 }).notNull(),
  imageProvider: aiProviderEnum('image_provider').notNull(),
  imageModel: varchar('image_model', { length: 100 }).notNull(),
  reasoning: text('reasoning').notNull(),
  estCostLow: numeric('est_cost_low', { precision: 6, scale: 2 }).notNull(),
  estCostHigh: numeric('est_cost_high', { precision: 6, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
