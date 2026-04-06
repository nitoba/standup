import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

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

export const standups = sqliteTable(
  'standups',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    meetingType: text('meeting_type').notNull(),
    content: text('content').notNull(),
    sourceData: text('source_data').notNull(),
    customEntries: text('custom_entries'),
    status: text('status', {
      enum: [
        'draft',
        'delivery_pending',
        'pending_review',
        'approved',
        'rejected',
      ],
    })
      .notNull()
      .default('draft'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    dmMessageId: text('dm_message_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    sentToDiscordAt: integer('sent_to_discord_at'),
  },
  (table) => ({
    // Prevent duplicate standups for the same user on the same day (TAS-58)
    userDateUnique: uniqueIndex('standups_user_date_unique').on(
      table.userId,
      table.date,
    ),
  }),
)

export const jobRuns = sqliteTable(
  'job_runs',
  {
    id: text('id').primaryKey(),
    jobName: text('job_name').notNull(),
    date: text('date').notNull(),
    status: text('status', {
      enum: ['running', 'success', 'failed'],
    }).notNull(),
    userId: text('user_id').references(() => user.id),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
  },
  (table) => ({
    // Prevent duplicate lock records for the same job+date+user (TAS-59)
    jobDateUserUnique: uniqueIndex('job_runs_job_date_user_unique').on(
      table.jobName,
      table.date,
      table.userId,
    ),
  }),
)

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
  azureDevopsUser: text('azure_devops_user'),
  azureDevopsUuid: text('azure_devops_uuid'),
  gitSincePeriod: text('git_since_period').notNull().default('8 hours ago'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  snoozedUntil: integer('snoozed_until'),
  cancelledDate: text('cancelled_date'),
  emailTheme: text('email_theme', { enum: ['light', 'dark'] })
    .notNull()
    .default('dark'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const weeklyDigests = sqliteTable('weekly_digests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  weekStart: text('week_start').notNull(),
  weekEnd: text('week_end').notNull(),
  standupIds: text('standup_ids').notNull().default('[]'),
  insights: text('insights').notNull().default(''),
  status: text('status', {
    enum: ['pending', 'sending', 'sent', 'unknown', 'failed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  error: text('error'),
  sentAt: integer('sent_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
