import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id)
    .unique()
    .notNull(),
  telegramChatId: varchar('telegram_chat_id', { length: 100 }),
  telegramEnabled: boolean('telegram_enabled').default(true),
  notifyDailyDigest: boolean('notify_daily_digest').default(true),
  notifyPublishSuccess: boolean('notify_publish_success').default(true),
  notifyPublishFailure: boolean('notify_publish_failure').default(true),
  notifyTokenExpiry: boolean('notify_token_expiry').default(true),
  notifyWeeklyReport: boolean('notify_weekly_report').default(true),
  notifyConnectionHealth: boolean('notify_connection_health').default(true),
  digestTime: varchar('digest_time', { length: 5 }).default('08:00'),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
