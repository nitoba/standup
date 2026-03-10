import {
  getDb,
  UserSettingsRepository,
  type UserSettingsRow,
} from '@standup/db'
import { type DbError, Result } from '@standup/domain'

export interface SettingsServiceDeps {
  databaseUrl: string
}

export interface SettingsRecord {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
  snoozedUntil: number | null
  cancelledDate: string | null
}

export interface UpsertSettingsInput {
  userId: string
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod?: string
  selectedRepos: string[]
  active?: boolean
}

const DEFAULT_SETTINGS: SettingsRecord = {
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  gitAuthor: '',
  gitSincePeriod: '8 hours ago',
  selectedRepos: [],
  active: true,
  snoozedUntil: null,
  cancelledDate: null,
}

function createDefaultSettings(): SettingsRecord {
  return {
    ...DEFAULT_SETTINGS,
    selectedRepos: [...DEFAULT_SETTINGS.selectedRepos],
  }
}

function parseSelectedRepos(rawSelectedRepos: string): string[] {
  try {
    const parsed = JSON.parse(rawSelectedRepos)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((repo): repo is string => typeof repo === 'string')
  } catch {
    return []
  }
}

function toSettingsRecord(row: UserSettingsRow): SettingsRecord {
  return {
    standupCron: row.standupCron,
    reminderCron: row.reminderCron,
    recoveryCron: row.recoveryCron,
    timezone: row.timezone,
    gitAuthor: row.gitAuthor,
    gitSincePeriod: row.gitSincePeriod,
    selectedRepos: parseSelectedRepos(row.selectedRepos),
    active: row.active,
    snoozedUntil: row.snoozedUntil,
    cancelledDate: row.cancelledDate,
  }
}

export function getUserSettingsOrDefaults(
  userId: string,
  deps: SettingsServiceDeps,
): Result<SettingsRecord, DbError> {
  const db = getDb(deps.databaseUrl)
  const repo = new UserSettingsRepository(db)
  const result = repo.findByUserId(userId)

  if (result.isErr()) {
    return result
  }

  if (result.value === null) {
    return Result.ok(createDefaultSettings())
  }

  return Result.ok(toSettingsRecord(result.value))
}

export function upsertUserSettings(
  input: UpsertSettingsInput,
  deps: SettingsServiceDeps,
): Result<SettingsRecord, DbError> {
  const db = getDb(deps.databaseUrl)
  const repo = new UserSettingsRepository(db)
  const payload = {
    userId: input.userId,
    standupCron: input.standupCron,
    reminderCron: input.reminderCron,
    recoveryCron: input.recoveryCron,
    timezone: input.timezone,
    gitAuthor: input.gitAuthor,
    gitSincePeriod: input.gitSincePeriod ?? DEFAULT_SETTINGS.gitSincePeriod,
    selectedRepos: JSON.stringify(input.selectedRepos),
    ...(input.active !== undefined && { active: input.active }),
  }
  const result = repo.upsert(payload)

  if (result.isErr()) {
    return result
  }

  return Result.ok(toSettingsRecord(result.value))
}
