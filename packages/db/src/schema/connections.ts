import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { platformEnum, connectionHealthEnum } from './_enums';

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
    connectionHealth: connectionHealthEnum('connection_health').default('healthy'),
    lastHealthCheck: timestamp('last_health_check'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [unique('platform_connections_user_platform_unique').on(table.userId, table.platform)],
);
