import type { WeeklyDigestRecord, WeeklyDigestStatus } from '@standup/domain'
import { DbError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../connection.js'
import type { NewWeeklyDigestRow } from '../schema.js'
import { weeklyDigests } from '../schema.js'

const logger = createServiceLogger({
  service: 'db',
  component: 'weekly-digest-repository',
})

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseStandupIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string')
    }
    return []
  } catch {
    return []
  }
}

function toRecord(row: typeof weeklyDigests.$inferSelect): WeeklyDigestRecord {
  return {
    id: row.id,
    userId: row.userId,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    standupIds: parseStandupIds(row.standupIds),
    insights: row.insights,
    status: row.status as WeeklyDigestStatus,
    error: row.error ?? null,
    sentAt: row.sentAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function dbErr(error: unknown, operation: string): DbError {
  const message = error instanceof Error ? error.message : 'Unknown DB error'
  logger.error(`Failed to ${operation}`, { error: message })
  return new DbError({ operation, message: `${operation}: ${message}` })
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateWeeklyDigestInput {
  id: string
  userId: string
  weekStart: string
  weekEnd: string
  standupIds: string[]
  insights: string
  status: WeeklyDigestStatus
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class WeeklyDigestRepository {
  constructor(private db: Db) {}

  /** Find digest for a specific user and week (idempotency check). */
  findByUserAndWeek(
    userId: string,
    weekStart: string,
  ): Result<WeeklyDigestRecord | null, DbError> {
    try {
      const row = this.db
        .select()
        .from(weeklyDigests)
        .where(
          and(
            eq(weeklyDigests.userId, userId),
            eq(weeklyDigests.weekStart, weekStart),
          ),
        )
        .limit(1)
        .get()

      return Result.ok(row ? toRecord(row) : null)
    } catch (error) {
      return Result.err(dbErr(error, 'findByUserAndWeek'))
    }
  }

  /** Create a new weekly digest record. */
  create(input: CreateWeeklyDigestInput): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const newRow: NewWeeklyDigestRow = {
        id: input.id,
        userId: input.userId,
        weekStart: input.weekStart,
        weekEnd: input.weekEnd,
        standupIds: JSON.stringify(input.standupIds),
        insights: input.insights,
        status: input.status,
        error: null,
        sentAt: null,
        createdAt: now,
        updatedAt: now,
      }

      const row = this.db.insert(weeklyDigests).values(newRow).returning().get()

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'create'))
    }
  }

  /** Mark a digest as sent. */
  markSent(id: string): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({ status: 'sent', sentAt: now, updatedAt: now })
        .where(eq(weeklyDigests.id, id))
        .returning()
        .get()

      if (!row) {
        return Result.err(
          new DbError({
            operation: 'markSent',
            message: `Weekly digest not found: ${id}`,
          }),
        )
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'markSent'))
    }
  }

  /** Mark a digest as failed with an error message. */
  markFailed(
    id: string,
    errorMessage: string,
  ): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({ status: 'failed', error: errorMessage, updatedAt: now })
        .where(eq(weeklyDigests.id, id))
        .returning()
        .get()

      if (!row) {
        return Result.err(
          new DbError({
            operation: 'markFailed',
            message: `Weekly digest not found: ${id}`,
          }),
        )
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'markFailed'))
    }
  }

  /** Mark a digest as skipped (no approved standups found). */
  markSkipped(id: string): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({ status: 'skipped', updatedAt: now })
        .where(eq(weeklyDigests.id, id))
        .returning()
        .get()

      if (!row) {
        return Result.err(
          new DbError({
            operation: 'markSkipped',
            message: `Weekly digest not found: ${id}`,
          }),
        )
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'markSkipped'))
    }
  }

  /**
   * Persist the standup IDs and AI-generated insights onto the record.
   * Called after insights generation succeeds, before sending the email.
   * Allows the digest record to be a complete audit trail of what was sent.
   */
  saveContent(
    id: string,
    standupIds: string[],
    insights: string,
  ): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({
          standupIds: JSON.stringify(standupIds),
          insights,
          updatedAt: now,
        })
        .where(eq(weeklyDigests.id, id))
        .returning()
        .get()

      if (!row) {
        return Result.err(
          new DbError({
            operation: 'saveContent',
            message: `Weekly digest not found: ${id}`,
          }),
        )
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'saveContent'))
    }
  }

  /**
   * Atomically claim a digest for sending.
   *
   * Transitions status from 'pending' or 'failed' → 'sending' using a single
   * UPDATE WHERE status IN (...). If another process already claimed it (status
   * is 'sending', 'sent', 'unknown', or 'skipped'), returns null — meaning the
   * caller should not proceed.
   *
   * This is Akita's Padrão 2 (Atomic Claiming): the UPDATE itself is the lock.
   */
  claimForSending(
    userId: string,
    weekStart: string,
  ): Result<WeeklyDigestRecord | null, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({ status: 'sending', updatedAt: now })
        .where(
          and(
            eq(weeklyDigests.userId, userId),
            eq(weeklyDigests.weekStart, weekStart),
            inArray(weeklyDigests.status, ['pending', 'failed']),
          ),
        )
        .returning()
        .get()

      return Result.ok(row ? toRecord(row) : null)
    } catch (error) {
      return Result.err(dbErr(error, 'claimForSending'))
    }
  }

  /**
   * Mark a digest as 'unknown'.
   *
   * Used when the SMTP transport accepted the email but a subsequent step
   * (e.g. markSent DB write) failed. The digest may or may not have been
   * delivered. 'unknown' is a terminal state — it is never automatically
   * retried (Akita's Padrão 3: smtp_accepted flag + Padrão 4: immutable
   * terminal states).
   */
  markUnknown(
    id: string,
    errorMessage: string,
  ): Result<WeeklyDigestRecord, DbError> {
    try {
      const now = Date.now()
      const row = this.db
        .update(weeklyDigests)
        .set({ status: 'unknown', error: errorMessage, updatedAt: now })
        .where(eq(weeklyDigests.id, id))
        .returning()
        .get()

      if (!row) {
        return Result.err(
          new DbError({
            operation: 'markUnknown',
            message: `Weekly digest not found: ${id}`,
          }),
        )
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'markUnknown'))
    }
  }
}
