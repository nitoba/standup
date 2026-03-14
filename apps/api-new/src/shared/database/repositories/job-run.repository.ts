import { Injectable } from '@nestjs/common'
import {
  DbError,
  JobAlreadyCompletedError,
  LockAlreadyHeldError,
  Result,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, lt } from 'drizzle-orm'
import { DatabaseService } from '../database.service'
import { jobRuns } from '../schema'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'job-run-repository',
})

export interface AcquireLockInput {
  id: string
  jobName: string
  date: string
  userId?: string
  forceRegenerate?: boolean
}

export type JobRunStatus = 'running' | 'success' | 'failed'

@Injectable()
export class JobRunRepository {
  constructor(private readonly database: DatabaseService) {}

  async acquireLock(
    input: AcquireLockInput,
  ): Promise<
    Result<
      typeof jobRuns.$inferSelect,
      LockAlreadyHeldError | JobAlreadyCompletedError | DbError
    >
  > {
    try {
      const conditions = [
        eq(jobRuns.jobName, input.jobName),
        eq(jobRuns.date, input.date),
      ]

      if (input.userId) {
        conditions.push(eq(jobRuns.userId, input.userId))
      }

      const existing = await this.database.db
        .select()
        .from(jobRuns)
        .where(and(...conditions))
        .get()

      if (existing) {
        if (existing.status === 'running') {
          if (!input.forceRegenerate) {
            return Result.err(
              new LockAlreadyHeldError({
                jobName: input.jobName,
                date: input.date,
              }),
            )
          }

          await this.database.db
            .delete(jobRuns)
            .where(eq(jobRuns.id, existing.id))
        } else if (existing.status === 'success') {
          if (!input.forceRegenerate) {
            return Result.err(
              new JobAlreadyCompletedError({
                jobName: input.jobName,
                date: input.date,
              }),
            )
          }

          await this.database.db
            .delete(jobRuns)
            .where(eq(jobRuns.id, existing.id))
        } else {
          await this.database.db
            .delete(jobRuns)
            .where(eq(jobRuns.id, existing.id))
        }
      }

      await this.database.db.insert(jobRuns).values({
        id: input.id,
        jobName: input.jobName,
        date: input.date,
        status: 'running',
        userId: input.userId ?? null,
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
      })

      const created = await this.database.db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.id, input.id))
        .get()

      if (!created) {
        return this.dbErr(
          'acquireLock',
          new Error('insert succeeded but row not found'),
        )
      }

      return Result.ok(created)
    } catch (error) {
      return this.dbErr('acquireLock', error)
    }
  }

  async releaseLock(
    id: string,
    status: JobRunStatus,
    error?: string,
  ): Promise<Result<void, DbError>> {
    try {
      await this.database.db
        .update(jobRuns)
        .set({
          status,
          finishedAt: Date.now(),
          error: error ?? null,
        })
        .where(eq(jobRuns.id, id))

      return Result.ok(undefined)
    } catch (err) {
      return this.dbErr('releaseLock', err)
    }
  }

  async findStaleRuns(maxAgeMs: number) {
    try {
      const cutoff = Date.now() - maxAgeMs
      const rows = await this.database.db
        .select()
        .from(jobRuns)
        .where(
          and(eq(jobRuns.status, 'running'), lt(jobRuns.startedAt, cutoff)),
        )
        .all()

      return Result.ok(rows)
    } catch (error) {
      return this.dbErr('findStaleRuns', error)
    }
  }

  async findByJobAndDate(
    jobName: string,
    date: string,
    userId?: string,
  ): Promise<Result<typeof jobRuns.$inferSelect | null, DbError>> {
    try {
      const conditions = [eq(jobRuns.jobName, jobName), eq(jobRuns.date, date)]

      if (userId) {
        conditions.push(eq(jobRuns.userId, userId))
      }

      const row = await this.database.db
        .select()
        .from(jobRuns)
        .where(and(...conditions))
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      return this.dbErr('findByJobAndDate', error)
    }
  }

  private dbErr(operation: string, error: unknown): Result<never, DbError> {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('DB operation failed', { operation, error: message })
    return Result.err(new DbError({ operation, message }))
  }
}
