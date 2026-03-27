import { pgTable, uuid, varchar, text, jsonb, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { aiProviderEnum } from './_enums';

export { aiProviderEnum };

export const userAiKeys = pgTable(
  'user_ai_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    provider: aiProviderEnum('provider').notNull(),
    apiKeyEnc: text('api_key_enc').notNull(), // AES-256 encrypted
    capabilities: jsonb('capabilities').notNull(), // { web_search, x_search, image_gen, models }
    validatedAt: timestamp('validated_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [unique('user_ai_keys_user_provider_unique').on(table.userId, table.provider)],
);

export const userModelConfig = pgTable('user_model_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .unique()
    .notNull(),
  slotA: jsonb('slot_a'), // { provider, model }
  slotB: jsonb('slot_b'),
  slotC: jsonb('slot_c'),
  slotD: jsonb('slot_d'),
  subAgentModel: jsonb('sub_agent_model'),
  captionModel: jsonb('caption_model'),
  imageModel: jsonb('image_model'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

