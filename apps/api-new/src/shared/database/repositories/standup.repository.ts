import { Injectable } from '@nestjs/common'
import type {
  CustomEntries,
  StandupRecord,
  StandupStatus,
} from '@standup/domain'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  transitionStandupStatus,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, desc, eq, gte, like, lte, or, type SQL, sql } from 'drizzle-orm'
import { DatabaseService } from '../database.service'
import { standups } from '../schema'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'standup-repository',
})

function parseCustomEntries(raw: string | null): CustomEntries | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as CustomEntries

    if (
      Array.isArray(parsed.scheduledMeetings) &&
      Array.isArray(parsed.directCalls)
    ) {
      return parsed
    }

    return null
  } catch {
    return null
  }
}

function toRecord(row: typeof standups.$inferSelect): StandupRecord {
  return {
    id: row.id,
    date: row.date,
    meetingType: row.meetingType,
    content: row.content,
    sourceData: row.sourceData,
    customEntries: parseCustomEntries(row.customEntries),
    status: row.status as StandupStatus,
    userId: row.userId,
    dmMessageId: row.dmMessageId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export interface CreateStandupInput {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  userId: string
}

export interface ReplaceGeneratedStandupInput {
  meetingType: string
  content: string
  sourceData: string
}

export interface ListStandupFilters {
  status?: StandupStatus
  date?: string
  from?: string
  to?: string
  userId?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface StandupListSummary {
  total: number
  approved: number
  pending: number
  rejected: number
}

export interface PaginatedStandupList {
  items: StandupRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  summary: StandupListSummary
}

function buildListConditions(filters?: ListStandupFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = []

  if (filters?.status) {
    if (filters.status === 'approved') {
      const approvedCondition = or(
        eq(standups.status, 'approved'),
        eq(standups.status, 'published'),
      )

      if (approvedCondition) {
        conditions.push(approvedCondition)
      }
    } else {
      conditions.push(eq(standups.status, filters.status))
    }
  }

  if (filters?.date) {
    if (filters.date === 'this_week') {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      startOfToday.setDate(startOfToday.getDate() - 6)

      const year = startOfToday.getFullYear()
      const month = String(startOfToday.getMonth() + 1).padStart(2, '0')
      const day = String(startOfToday.getDate()).padStart(2, '0')

      conditions.push(gte(standups.date, `${year}-${month}-${day}`))
    } else {
      conditions.push(eq(standups.date, filters.date))
    }
  }

  if (filters?.from) {
    conditions.push(gte(standups.date, filters.from))
  }

  if (filters?.to) {
    conditions.push(lte(standups.date, filters.to))
  }

  if (filters?.userId) {
    conditions.push(eq(standups.userId, filters.userId))
  }

  const search = filters?.search?.trim()
  if (search) {
    const term = `%${search}%`
    const searchCondition = or(
      like(standups.id, term),
      like(standups.date, term),
      like(standups.content, term),
    )

    if (searchCondition) {
      conditions.push(searchCondition)
    }
  }

  return conditions
}

@Injectable()
export class StandupRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    input: CreateStandupInput,
  ): Promise<Result<StandupRecord, DbError>> {
    try {
      const now = Date.now()

      await this.database.db.insert(standups).values({
        id: input.id,
        date: input.date,
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
        status: 'draft',
        userId: input.userId,
        createdAt: now,
        updatedAt: now,
      })

      const created = await this.database.db
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
      const row = await this.database.db
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

  async list(
    filters?: ListStandupFilters,
  ): Promise<Result<PaginatedStandupList, DbError>> {
    try {
      const conditions = buildListConditions(filters)
      const page = Math.max(filters?.page ?? 1, 1)
      const pageSize = Math.max(filters?.pageSize ?? 20, 1)
      const offset = (page - 1) * pageSize
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      const totalQuery = this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(standups)

      const summaryQuery = this.database.db
        .select({
          total: sql<number>`count(*)`,
          approved: sql<number>`sum(case when ${standups.status} in ('approved', 'published') then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${standups.status} = 'pending_review' then 1 else 0 end)`,
          rejected: sql<number>`sum(case when ${standups.status} = 'rejected' then 1 else 0 end)`,
        })
        .from(standups)

      const rowsQuery = this.database.db
        .select()
        .from(standups)
        .orderBy(desc(standups.date), desc(standups.createdAt))
        .limit(pageSize)
        .offset(offset)

      const totalRow = whereClause
        ? await totalQuery.where(whereClause).get()
        : await totalQuery.get()

      const summaryRow = whereClause
        ? await summaryQuery.where(whereClause).get()
        : await summaryQuery.get()

      const rows = whereClause
        ? await rowsQuery.where(whereClause).all()
        : await rowsQuery.all()

      const total = totalRow?.count ?? 0
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)

      return Result.ok({
        items: rows.map(toRecord),
        page,
        pageSize,
        total,
        totalPages,
        summary: {
          total: summaryRow?.total ?? 0,
          approved: summaryRow?.approved ?? 0,
          pending: summaryRow?.pending ?? 0,
          rejected: summaryRow?.rejected ?? 0,
        },
      })
    } catch (error) {
      return this.dbErr('list', error)
    }
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const row = await this.database.db
        .select()
        .from(standups)
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))
        .get()

      if (!row) {
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      }

      return Result.ok(toRecord(row))
    } catch (error) {
      return this.dbErr('findByIdForUser', error)
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

      if (found.isErr()) {
        return found
      }

      const transition = transitionStandupStatus(found.value.status, nextStatus)
      if (transition.isErr()) {
        return transition
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ status: nextStatus, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({
        ...found.value,
        status: nextStatus,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateStatus', error)
    }
  }

  async updateStatusForUser(
    id: string,
    userId: string,
    nextStatus: StandupStatus,
  ): Promise<
    Result<StandupRecord, NotFoundError | DbError | InvalidStateTransitionError>
  > {
    try {
      const found = await this.findByIdForUser(id, userId)

      if (found.isErr()) {
        return found
      }

      const transition = transitionStandupStatus(found.value.status, nextStatus)
      if (transition.isErr()) {
        return transition
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ status: nextStatus, updatedAt: now })
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))

      return Result.ok({
        ...found.value,
        status: nextStatus,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateStatusForUser', error)
    }
  }

  async updateContent(
    id: string,
    content: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ content, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({
        ...found.value,
        content,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateContent', error)
    }
  }

  async updateContentForUser(
    id: string,
    userId: string,
    content: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findByIdForUser(id, userId)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ content, updatedAt: now })
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))

      return Result.ok({
        ...found.value,
        content,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateContentForUser', error)
    }
  }

  async updateCustomEntries(
    id: string,
    entries: CustomEntries,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      const serialized = JSON.stringify(entries)

      await this.database.db
        .update(standups)
        .set({ customEntries: serialized, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({
        ...found.value,
        customEntries: entries,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateCustomEntries', error)
    }
  }

  async updateCustomEntriesForUser(
    id: string,
    userId: string,
    entries: CustomEntries,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findByIdForUser(id, userId)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      const serialized = JSON.stringify(entries)

      await this.database.db
        .update(standups)
        .set({ customEntries: serialized, updatedAt: now })
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))

      return Result.ok({
        ...found.value,
        customEntries: entries,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateCustomEntriesForUser', error)
    }
  }

  async findLatestByUserAndDate(
    userId: string,
    date: string,
  ): Promise<Result<StandupRecord | null, DbError>> {
    try {
      const row = await this.database.db
        .select()
        .from(standups)
        .where(and(eq(standups.userId, userId), eq(standups.date, date)))
        .orderBy(desc(standups.updatedAt), desc(standups.createdAt))
        .get()

      return Result.ok(row ? toRecord(row) : null)
    } catch (error) {
      return this.dbErr('findLatestByUserAndDate', error)
    }
  }

  async updateDmMessageId(
    id: string,
    dmMessageId: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ dmMessageId, updatedAt: now })
        .where(eq(standups.id, id))

      return Result.ok({
        ...found.value,
        dmMessageId,
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('updateDmMessageId', error)
    }
  }

  async replaceGeneratedForUser(
    id: string,
    userId: string,
    input: ReplaceGeneratedStandupInput,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findByIdForUser(id, userId)

      if (found.isErr()) {
        return found
      }

      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({
          meetingType: input.meetingType,
          content: input.content,
          sourceData: input.sourceData,
          customEntries: null,
          status: 'draft',
          updatedAt: now,
        })
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))

      return Result.ok({
        ...found.value,
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
        customEntries: null,
        status: 'draft',
        updatedAt: now,
      })
    } catch (error) {
      return this.dbErr('replaceGeneratedForUser', error)
    }
  }

  async findApprovedByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<Result<StandupRecord[], DbError>> {
    try {
      const rows = await this.database.db
        .select()
        .from(standups)
        .where(
          and(
            eq(standups.userId, userId),
            gte(standups.date, startDate),
            lte(standups.date, endDate),
            or(
              eq(standups.status, 'approved'),
              eq(standups.status, 'published'),
            ),
          ),
        )
        .orderBy(desc(standups.date))
        .all()

      return Result.ok(rows.map(toRecord))
    } catch (error) {
      return this.dbErr('findApprovedByUserAndDateRange', error)
    }
  }

  private dbErr(operation: string, error: unknown): Result<never, DbError> {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('DB operation failed', { operation, error: message })
    return Result.err(new DbError({ operation, message }))
  }
}
