import { Injectable } from '@nestjs/common'
import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import {
  DbError,
  NotFoundError,
  Result,
  StandupRecord,
} from '../../../shared/domain'
import { AppLoggerFactory } from '../../logger'
import { DatabaseService } from '../database.service'
import { standups } from '../schema'
import {
  buildListConditions,
  buildOrderBy,
  dbErr,
  type ListStandupFilters,
  type PaginatedStandupList,
  type StandupMetricChanges,
  toRecord,
} from './standup-helpers'

@Injectable()
export class StandupReadRepository {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly database: DatabaseService,
  ) {
    this.logger = this.loggerFactory.create('standup-read-repository')
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
      if (!row)
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      return Result.ok(toRecord(row))
    } catch (error) {
      return dbErr(this.logger, 'findById', error)
    }
  }

  async list(
    filters?: ListStandupFilters,
  ): Promise<Result<PaginatedStandupList, DbError>> {
    try {
      const conditions = buildListConditions(filters)
      const page = Math.max(filters?.page ?? 1, 1)
      const pageSize = Math.min(Math.max(filters?.pageSize ?? 20, 1), 100)
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
        .orderBy(...buildOrderBy(filters))
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
      return dbErr(this.logger, 'list', error)
    }
  }

  async getMetricChangesForUser(
    userId: string,
    currentWeekFrom: string,
    currentWeekTo: string,
    previousWeekFrom: string,
    previousWeekTo: string,
  ): Promise<Result<StandupMetricChanges, DbError>> {
    try {
      const buildMetricsQuery = (from: string, to: string) =>
        this.database.db
          .select({
            total: sql<number>`count(*)`,
            approved: sql<number>`sum(case when ${standups.status} in ('approved', 'published') then 1 else 0 end)`,
            pending: sql<number>`sum(case when ${standups.status} = 'pending_review' then 1 else 0 end)`,
            rejected: sql<number>`sum(case when ${standups.status} = 'rejected' then 1 else 0 end)`,
          })
          .from(standups)
          .where(
            and(
              eq(standups.userId, userId),
              gte(standups.date, from),
              lte(standups.date, to),
            ),
          )
          .get()

      const [current, previous] = await Promise.all([
        buildMetricsQuery(currentWeekFrom, currentWeekTo),
        buildMetricsQuery(previousWeekFrom, previousWeekTo),
      ])

      const currentSafe = current ?? {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      }
      const previousSafe = previous ?? {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
      }

      return Result.ok({
        total: {
          current: currentSafe.total ?? 0,
          previous: previousSafe.total ?? 0,
          delta: (currentSafe.total ?? 0) - (previousSafe.total ?? 0),
        },
        approved: {
          current: currentSafe.approved ?? 0,
          previous: previousSafe.approved ?? 0,
          delta: (currentSafe.approved ?? 0) - (previousSafe.approved ?? 0),
        },
        pending: {
          current: currentSafe.pending ?? 0,
          previous: previousSafe.pending ?? 0,
          delta: (currentSafe.pending ?? 0) - (previousSafe.pending ?? 0),
        },
        rejected: {
          current: currentSafe.rejected ?? 0,
          previous: previousSafe.rejected ?? 0,
          delta: (currentSafe.rejected ?? 0) - (previousSafe.rejected ?? 0),
        },
      })
    } catch (error) {
      return dbErr(this.logger, 'getMetricChangesForUser', error)
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
      if (!row)
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      return Result.ok(toRecord(row))
    } catch (error) {
      return dbErr(this.logger, 'findByIdForUser', error)
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
      return dbErr(this.logger, 'findLatestByUserAndDate', error)
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
      return dbErr(this.logger, 'findApprovedByUserAndDateRange', error)
    }
  }
}
