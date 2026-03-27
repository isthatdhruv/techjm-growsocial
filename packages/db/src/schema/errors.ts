import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { errorCategoryEnum } from './_enums';

export { errorCategoryEnum };

export const jobErrors = pgTable(
  'job_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    jobType: varchar('job_type', { length: 50 }).notNull(),
    jobId: varchar('job_id', { length: 255 }).notNull(),
    errorCategory: errorCategoryEnum('error_category').notNull(),
    errorMessage: text('error_message').notNull(),
    context: jsonb('context'),
    stack: text('stack'),
    resolved: boolean('resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_job_errors_user_created').on(table.userId, table.createdAt),
    index('idx_job_errors_category').on(table.errorCategory),
  ],
);
