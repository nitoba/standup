import { DbError, Result } from '@standup/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  findByUserId: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function UserSettingsRepository() {
    return {
      findByUserId: mocks.findByUserId,
      upsert: mocks.upsert,
    }
  }

  return {
    getDb: mocks.getDb,
    UserSettingsRepository,
  }
})

import {
  getUserSettingsOrDefaults,
  upsertUserSettings,
} from './settings-service.js'

const deps = {
  databaseUrl: ':memory:',
}

describe('settings-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDb.mockReturnValue({})
  })

  it('returns persisted settings with selectedRepos parsed to string array', () => {
    mocks.findByUserId.mockReturnValue(
      Result.ok({
        userId: 'user-1',
        standupCron: '0 9 * * 1-5',
        reminderCron: '50 8 * * 1-5',
        recoveryCron: '30 9 * * 1-5',
        timezone: 'Europe/London',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '24 hours ago',
        selectedRepos: '["repo-a","repo-b"]',
        active: false,
        snoozedUntil: 1_710_000_000_000,
        cancelledDate: '2026-03-09',
      }),
    )

    const result = getUserSettingsOrDefaults('user-1', deps)

    expect(result).toEqual(
      Result.ok({
        standupCron: '0 9 * * 1-5',
        reminderCron: '50 8 * * 1-5',
        recoveryCron: '30 9 * * 1-5',
        timezone: 'Europe/London',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '24 hours ago',
        selectedRepos: ['repo-a', 'repo-b'],
        active: false,
        snoozedUntil: 1_710_000_000_000,
        cancelledDate: '2026-03-09',
      }),
    )
  })

  it('returns typed defaults when the user has no persisted row yet', () => {
    mocks.findByUserId.mockReturnValue(Result.ok(null))

    const result = getUserSettingsOrDefaults('user-1', deps)

    expect(result).toEqual(
      Result.ok({
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
      }),
    )
  })

  it('returns fresh defaults on each first-time call', () => {
    mocks.findByUserId.mockReturnValue(Result.ok(null))

    const firstResult = getUserSettingsOrDefaults('user-1', deps)
    expect(firstResult.isOk()).toBe(true)
    if (firstResult.isErr()) {
      return
    }

    firstResult.value.selectedRepos.push('repo-leak')

    const secondResult = getUserSettingsOrDefaults('user-1', deps)

    expect(secondResult).toEqual(
      Result.ok({
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
      }),
    )

    if (secondResult.isOk()) {
      expect(secondResult.value).not.toBe(firstResult.value)
      expect(secondResult.value.selectedRepos).not.toBe(
        firstResult.value.selectedRepos,
      )
    }
  })

  it('falls back to an empty repo list when persisted selectedRepos is invalid JSON', () => {
    mocks.findByUserId.mockReturnValue(
      Result.ok({
        userId: 'user-1',
        standupCron: '30 17 * * 1-5',
        reminderCron: '20 17 * * 1-5',
        recoveryCron: '0 18 * * 1-5',
        timezone: 'America/Sao_Paulo',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '8 hours ago',
        selectedRepos: '{bad-json',
        active: true,
        snoozedUntil: null,
        cancelledDate: null,
      }),
    )

    const result = getUserSettingsOrDefaults('user-1', deps)

    expect(result).toEqual(
      Result.ok({
        standupCron: '30 17 * * 1-5',
        reminderCron: '20 17 * * 1-5',
        recoveryCron: '0 18 * * 1-5',
        timezone: 'America/Sao_Paulo',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '8 hours ago',
        selectedRepos: [],
        active: true,
        snoozedUntil: null,
        cancelledDate: null,
      }),
    )
  })

  it('serializes selectedRepos before persisting and returns typed settings', () => {
    mocks.upsert.mockReturnValue(
      Result.ok({
        userId: 'user-1',
        standupCron: '0 10 * * 1-5',
        reminderCron: '50 9 * * 1-5',
        recoveryCron: '30 10 * * 1-5',
        timezone: 'UTC',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '8 hours ago',
        selectedRepos: '["repo-c"]',
        active: true,
        snoozedUntil: null,
        cancelledDate: null,
      }),
    )

    const result = upsertUserSettings(
      {
        userId: 'user-1',
        standupCron: '0 10 * * 1-5',
        reminderCron: '50 9 * * 1-5',
        recoveryCron: '30 10 * * 1-5',
        timezone: 'UTC',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '8 hours ago',
        selectedRepos: ['repo-c'],
        active: true,
      },
      deps,
    )

    expect(mocks.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      standupCron: '0 10 * * 1-5',
      reminderCron: '50 9 * * 1-5',
      recoveryCron: '30 10 * * 1-5',
      timezone: 'UTC',
      gitAuthor: 'dev@example.com',
      gitSincePeriod: '8 hours ago',
      selectedRepos: '["repo-c"]',
      active: true,
    })
    expect(result).toEqual(
      Result.ok({
        standupCron: '0 10 * * 1-5',
        reminderCron: '50 9 * * 1-5',
        recoveryCron: '30 10 * * 1-5',
        timezone: 'UTC',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '8 hours ago',
        selectedRepos: ['repo-c'],
        active: true,
        snoozedUntil: null,
        cancelledDate: null,
      }),
    )
  })

  it('propagates repository errors unchanged', () => {
    const error = new DbError({
      operation: 'findByUserId',
      message: 'db offline',
    })
    mocks.findByUserId.mockReturnValue(Result.err(error))

    const result = getUserSettingsOrDefaults('user-1', deps)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBe(error)
    }
  })
})
