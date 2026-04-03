import { pgTable, uuid, varchar, text, timestamp, unique, jsonb, boolean } from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { platformEnum, connectionHealthEnum } from './_enums.js';

export { platformEnum, connectionHealthEnum };

export const platformConnections = pgTable(
  'platform_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    platform: platformEnum('platform').notNull(),
    accessTokenEnc: text('access_token_enc').notNull(), // AES-256 encrypted
    refreshTokenEnc: text('refresh_token_enc'), // AES-256 encrypted
    tokenExpiresAt: timestamp('token_expires_at'),
    orgUrn: varchar('org_urn', { length: 255 }), // LinkedIn company page URN
    accountName: varchar('account_name', { length: 255 }),
    accountId: varchar('account_id', { length: 255 }),
    scopes: jsonb('scopes').$type<string[]>().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    isActive: boolean('is_active').default(true).notNull(),
    connectionHealth: connectionHealthEnum('connection_health').default('healthy'),
    lastHealthCheck: timestamp('last_health_check'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [unique('platform_connections_user_platform_unique').on(table.userId, table.platform)],
);
