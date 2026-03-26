import { pgTable, pgEnum, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './auth';

export const platformEnum = pgEnum('social_platform', [
  'linkedin',
  'x',
  'instagram',
  'facebook',
  'tiktok',
  'threads',
  'bluesky',
]);

export const connectionHealthEnum = pgEnum('connection_health', [
  'healthy',
  'degraded',
  'expired',
  'disconnected',
]);

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

export const platformConnectionsRelations = relations(platformConnections, ({ one }) => ({
  user: one(users, {
    fields: [platformConnections.userId],
    references: [users.id],
  }),
}));
