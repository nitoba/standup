import type { StandupRecord, StandupStatus } from '@standup/domain'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  transitionStandupStatus,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { eq } from 'drizzle-orm'
import type { Db } from '../connection.js'
import type { NewStandupRow } from '../schema.js'
import { standups } from '../schema.js'

const logger = createServiceLogger({
  service: 'db',
  component: 'standup-repository',
})

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toRecord(row: typeof standups.$inferSelect): StandupRecord {
  return {
    id: row.id,
    date: row.date,
    meetingType: row.meetingType,
    content: row.content,
    sourceData: row.sourceData,
    status: row.status as StandupStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateStandupInput {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
}

export interface ListStandupFilters {
  status?: StandupStatus
  date?: string
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class StandupRepository {
  constructor(private readonly db: Db) {}

  async create(
    input: CreateStandupInput,
  ): Promise<Result<StandupRecord, DbError>> {
    try {
      const now = Date.now()
      const row: NewStandupRow = {
        id: input.id,
        date: input.date,
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      }

      await this.db.insert(standups).values(row)
      logger.debug('standup created', { id: input.id })

      const created = await this.db
        .select()
        .from(standups)
        .where(eq(standups.id, input.id))
        .get()

      if (!created) {
        return this.dbErr(
          'create',
          new Error('insert succeeded but row not found'),
        )
      }
      return Result.ok(toRecord(created))
    } catch (error) {
      return this.dbErr('create', error)
    }
  }

  async findById(
    id: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const row = await this.db
        .select()
        .from(standups)
        .where(eq(standups.id, id))
        .get()

      if (!row) {
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return this.dbErr('findById', error)
    }
  }

  async findByDate(date: string): Promise<Result<StandupRecord[], DbError>> {
    try {
      const rows = await this.db
        .select()
        .from(standups)
        .where(eq(standups.date, date))
        .all()

      return Result.ok(rows.map(toRecord))
    } catch (error) {
      return this.dbErr('findByDate', error)
    }
  }

  async findByStatus(
    status: StandupStatus,
  ): Promise<Result<StandupRecord[], DbError>> {
    try {
      const rows = await this.db
        .select()
        .from(standups)
        .where(eq(standups.status, status))
        .all()

      return Result.ok(rows.map(toRecord))
    } catch (error) {
      return this.dbErr('findByStatus', error)
    }
  }

  async list(
    filters?: ListStandupFilters,
  ): Promise<Result<StandupRecord[], DbError>> {
    try {
      const rows = await this.db
        .select()
        .from(standups)
        .where(
          filters?.status
            ? eq(standups.status, filters.status)
            : filters?.date
              ? eq(standups.date, filters.date)
              : undefined,
        )
        .all()

      return Result.ok(rows.map(toRecord))
    } catch (error) {
      return this.dbErr('list', error)
    }
  }

  async updateStatus(
    id: string,
    nextStatus: StandupStatus,
  ): Promise<
    Result<StandupRecord, NotFoundError | DbError | InvalidStateTransitionError>
  > {
    try {
      const found = await this.findById(id)
      if (found.isErr()) return found

      const transition = transitionStandupStatus(found.value.status, nextStatus)
      if (transition.isErr()) return transition

      const now = Date.now()
      await this.db
        .update(standups)
        .set({ status: nextStatus, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({ ...found.value, status: nextStatus, updatedAt: now })
    } catch (error) {
      return this.dbErr('updateStatus', error)
    }
  }

  async updateContent(
    id: string,
    content: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)
      if (found.isErr()) return found

      const now = Date.now()
      await this.db
        .update(standups)
        .set({ content, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({ ...found.value, content, updatedAt: now })
    } catch (error) {
      return this.dbErr('updateContent', error)
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private dbErr(operation: string, error: unknown): Result<never, DbError> {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('db operation failed', { operation, error: message })
    return Result.err(new DbError({ operation, message }))
  }
}
