import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// standups
// ---------------------------------------------------------------------------

export const standups = sqliteTable('standups', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  meetingType: text('meeting_type').notNull(),
  content: text('content').notNull(),
  sourceData: text('source_data').notNull(),
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
  status: text('status', {
    enum: ['running', 'success', 'failed'],
  }).notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  error: text('error'),
})

export type JobRunRow = typeof jobRuns.$inferSelect
export type NewJobRunRow = typeof jobRuns.$inferInsert
