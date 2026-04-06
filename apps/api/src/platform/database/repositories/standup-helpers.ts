import { asc, desc, eq, gte, like, lte, or, type SQL } from 'drizzle-orm'
import type {
  CustomEntries,
  StandupRecord,
  StandupStatus,
} from '../../../shared/domain'
import { DbError, Result, StandupStatusSchema } from '../../../shared/domain'
import type { AppLoggerFactory } from '../../logger'
import { isDisplayDate, toIsoDateFromDisplay } from '../../time/date-only'
import { standups } from '../schema'

// ── Type exports ────────────────────────────────────────────────────────────

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
  sort?: 'date' | 'createdAt' | 'status'
  sortDir?: 'asc' | 'desc'
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

export interface StandupMetricChange {
  current: number
  previous: number
  delta: number
}

export interface StandupMetricChanges {
  total: StandupMetricChange
  approved: StandupMetricChange
  pending: StandupMetricChange
  rejected: StandupMetricChange
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export function parseCustomEntries(raw: string | null): CustomEntries | null {
  if (!raw) return null
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

export function toRecord(row: typeof standups.$inferSelect): StandupRecord {
  const statusResult = StandupStatusSchema.safeParse(row.status)
  const status: StandupStatus = statusResult.success
    ? statusResult.data
    : 'draft'

  return {
    id: row.id,
    date: row.date,
    meetingType: row.meetingType,
    content: row.content,
    sourceData: row.sourceData,
    customEntries: parseCustomEntries(row.customEntries),
    status,
    userId: row.userId,
    dmMessageId: row.dmMessageId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentToDiscordAt: row.sentToDiscordAt ?? null,
  }
}

export function dbErr(
  logger: ReturnType<AppLoggerFactory['create']>,
  operation: string,
  error: unknown,
): Result<never, DbError> {
  const message = error instanceof Error ? error.message : String(error)
  logger.error('DB operation failed', { operation, error: message })
  return Result.err(new DbError({ operation, message }))
}

export function buildOrderBy(filters?: ListStandupFilters) {
  const sortDir = filters?.sortDir === 'asc' ? asc : desc
  switch (filters?.sort) {
    case 'createdAt':
      return [sortDir(standups.createdAt)]
    case 'status':
      return [
        sortDir(standups.status),
        desc(standups.date),
        desc(standups.createdAt),
      ]
    default:
      return [sortDir(standups.date), desc(standups.createdAt)]
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function buildListConditions(
  filters?: ListStandupFilters,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = []

  if (filters?.status) {
    conditions.push(eq(standups.status, filters.status))
  }

  if (filters?.date) {
    conditions.push(eq(standups.date, filters.date))
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
    const escaped = escapeLikePattern(search)
    const term = `%${escaped}%`
    const isoSearch = isDisplayDate(search)
      ? `%${escapeLikePattern(toIsoDateFromDisplay(search))}%`
      : null
    const c = or(
      like(standups.id, term),
      like(standups.date, term),
      ...(isoSearch ? [like(standups.date, isoSearch)] : []),
      like(standups.content, term),
    )
    if (c) conditions.push(c)
  }

  return conditions
}
