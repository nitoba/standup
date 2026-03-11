import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

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

export const account = sqliteTable(
  'account',
  {
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
  },
  (table) => ({
    providerAccountUnique: uniqueIndex('account_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
  }),
)

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
  userId: text('user_id').references(() => user.id),
  dmMessageId: text('dm_message_id'),
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
  userId: text('user_id').references(() => user.id),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  error: text('error'),
})

export type JobRunRow = typeof jobRuns.$inferSelect
export type NewJobRunRow = typeof jobRuns.$inferInsert

// ---------------------------------------------------------------------------
// user_settings  (per-user scheduler config, reminder state)
// ---------------------------------------------------------------------------

export const userSettings = sqliteTable('user_settings', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id),
  standupCron: text('standup_cron').notNull().default('30 17 * * 1-5'),
  reminderCron: text('reminder_cron').notNull().default('20 17 * * 1-5'),
  recoveryCron: text('recovery_cron').notNull().default('0 18 * * 1-5'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  selectedRepos: text('selected_repos').notNull().default('[]'),
  gitAuthor: text('git_author').notNull(),
  gitSincePeriod: text('git_since_period').notNull().default('8 hours ago'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  snoozedUntil: integer('snoozed_until'), // epoch ms, nullable
  cancelledDate: text('cancelled_date'), // 'YYYY-MM-DD', nullable
  emailTheme: text('email_theme', { enum: ['light', 'dark'] })
    .notNull()
    .default('dark'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type UserSettingsRow = typeof userSettings.$inferSelect
export type NewUserSettingsRow = typeof userSettings.$inferInsert

// ---------------------------------------------------------------------------
// weekly_digests  (email digest tracking)
// ---------------------------------------------------------------------------

export const weeklyDigests = sqliteTable('weekly_digests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  weekStart: text('week_start').notNull(), // YYYY-MM-DD (Monday)
  weekEnd: text('week_end').notNull(), // YYYY-MM-DD (Friday)
  standupIds: text('standup_ids').notNull().default('[]'), // JSON array of standup IDs
  insights: text('insights').notNull().default(''),
  status: text('status', {
    enum: ['pending', 'sending', 'sent', 'unknown', 'failed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  error: text('error'),
  sentAt: integer('sent_at'), // epoch ms
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type WeeklyDigestRow = typeof weeklyDigests.$inferSelect
export type NewWeeklyDigestRow = typeof weeklyDigests.$inferInsert
