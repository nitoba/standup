import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Better Auth tables (user, session, account, verification)
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp',
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export type UserRow = typeof user.$inferSelect
export type SessionRow = typeof session.$inferSelect
export type AccountRow = typeof account.$inferSelect

// ---------------------------------------------------------------------------
// standups
// ---------------------------------------------------------------------------

export const standups = sqliteTable('standups', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  meetingType: text('meeting_type').notNull(),
  content: text('content').notNull(),
  sourceData: text('source_data').notNull(),
  customEntries: text('custom_entries'), // JSON: { scheduledMeetings: string[], directCalls: string[] }
  status: text('status', {
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'published'],
  })
    .notNull()
    .default('draft'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type StandupRow = typeof standups.$inferSelect
export type NewStandupRow = typeof standups.$inferInsert

// ---------------------------------------------------------------------------
// job_runs  (idempotency tracking for the worker scheduler)
// ---------------------------------------------------------------------------

export const jobRuns = sqliteTable('job_runs', {
  id: text('id').primaryKey(),
  jobName: text('job_name').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD — scope do lock/idempotencia
  status: text('status', {
    enum: ['running', 'success', 'failed'],
  }).notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  error: text('error'),
})

export type JobRunRow = typeof jobRuns.$inferSelect
export type NewJobRunRow = typeof jobRuns.$inferInsert
