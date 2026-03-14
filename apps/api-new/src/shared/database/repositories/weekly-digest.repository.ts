import { Injectable } from '@nestjs/common'
import type { WeeklyDigestRecord, WeeklyDigestStatus } from '@standup/domain'
import { DbError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, inArray } from 'drizzle-orm'
import { DatabaseService } from '../database.service'
import { weeklyDigests } from '../schema'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'weekly-digest-repository',
})

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

export interface CreateWeeklyDigestInput {
  id: string
  userId: string
  weekStart: string
  weekEnd: string
  standupIds: string[]
  insights: string
  status: WeeklyDigestStatus
}

@Injectable()
export class WeeklyDigestRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByUserAndWeek(
    userId: string,
    weekStart: string,
  ): Promise<Result<WeeklyDigestRecord | null, DbError>> {
    try {
      const row = await this.database.db
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

  async create(
    input: CreateWeeklyDigestInput,
  ): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const now = Date.now()
      const row = await this.database.db
        .insert(weeklyDigests)
        .values({
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
        })
        .returning()
        .get()

      return Result.ok(toRecord(row))
    } catch (error) {
      return Result.err(dbErr(error, 'create'))
    }
  }

  async claimForSending(
    userId: string,
    weekStart: string,
  ): Promise<Result<WeeklyDigestRecord | null, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({ status: 'sending', updatedAt: Date.now() })
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

  async saveContent(
    id: string,
    standupIds: string[],
    insights: string,
  ): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({
          standupIds: JSON.stringify(standupIds),
          insights,
          updatedAt: Date.now(),
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

  async markSent(id: string): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({ status: 'sent', sentAt: Date.now(), updatedAt: Date.now() })
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

  async markFailed(
    id: string,
    errorMessage: string,
  ): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({ status: 'failed', error: errorMessage, updatedAt: Date.now() })
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

  async markSkipped(id: string): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({ status: 'skipped', updatedAt: Date.now() })
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

  async markUnknown(
    id: string,
    errorMessage: string,
  ): Promise<Result<WeeklyDigestRecord, DbError>> {
    try {
      const row = await this.database.db
        .update(weeklyDigests)
        .set({
          status: 'unknown',
          error: errorMessage,
          updatedAt: Date.now(),
        })
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
