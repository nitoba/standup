import { Result } from '@standup/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userSettings } from '../../../shared/database/schema'

const { isCronDueNowMock } = vi.hoisted(() => ({
  isCronDueNowMock: vi.fn(),
}))

vi.mock('./is-cron-due-now', () => ({
  isCronDueNow: isCronDueNowMock,
}))

import { WorkerSchedulerService } from './worker-scheduler.service'

type ActiveUserSettings = typeof userSettings.$inferSelect

function makeSettings(
  overrides: Partial<ActiveUserSettings> = {},
): ActiveUserSettings {
  return {
    id: 'settings-1',
    userId: 'user-1',
    standupCron: 'standup-cron',
    reminderCron: 'reminder-cron',
    recoveryCron: 'recovery-cron',
    timezone: 'America/Sao_Paulo',
    selectedRepos: '["repo-a"]',
    gitAuthor: 'nitoba',
    gitSincePeriod: '8 hours ago',
    active: true,
    snoozedUntil: null,
    cancelledDate: null,
    emailTheme: 'dark',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('WorkerSchedulerService', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches reminder notifications when reminder cron is due', async () => {
    isCronDueNowMock.mockImplementation(
      (expression: string) => expression === 'reminder-cron',
    )

    const userSettingsRepository = {
      clearExpiredSnoozes: vi.fn().mockResolvedValue(Result.ok(0)),
      findAllActive: vi.fn().mockResolvedValue(Result.ok([makeSettings()])),
    }
    const userRepository = {
      findDiscordIdByUserId: vi.fn().mockResolvedValue(Result.ok('discord-1')),
    }
    const reminderActions = {
      notifyReminder: vi.fn(),
    }
    const service = new WorkerSchedulerService(
      {
        config: { REPOS_ROOT_PATH: '/repos', SCHEDULER_ENABLED: true },
      } as never,
      userSettingsRepository as never,
      userRepository as never,
      {
        findStaleRuns: vi.fn().mockResolvedValue(Result.ok([])),
        findByJobAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
        releaseLock: vi.fn(),
      } as never,
      { dispatchStandupJob: vi.fn() } as never,
      { dispatchWeeklyDigestJob: vi.fn() } as never,
      reminderActions as never,
      { format: vi.fn().mockReturnValue('2026-03-13') } as never,
    )

    await service.handleSchedulerTick()

    expect(reminderActions.notifyReminder).toHaveBeenCalledTimes(1)
    expect(userSettingsRepository.clearExpiredSnoozes).toHaveBeenCalledTimes(1)
  })

  it('dispatches standup jobs when standup cron is due', async () => {
    isCronDueNowMock.mockImplementation(
      (expression: string) => expression === 'standup-cron',
    )

    const standupDispatch = {
      dispatchStandupJob: vi.fn(),
    }
    const service = new WorkerSchedulerService(
      {
        config: { REPOS_ROOT_PATH: '/repos', SCHEDULER_ENABLED: true },
      } as never,
      {
        clearExpiredSnoozes: vi.fn().mockResolvedValue(Result.ok(0)),
        findAllActive: vi.fn().mockResolvedValue(Result.ok([makeSettings()])),
      } as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findStaleRuns: vi.fn().mockResolvedValue(Result.ok([])),
        findByJobAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
        releaseLock: vi.fn(),
      } as never,
      standupDispatch as never,
      { dispatchWeeklyDigestJob: vi.fn() } as never,
      { notifyReminder: vi.fn() } as never,
      { format: vi.fn().mockReturnValue('2026-03-13') } as never,
    )

    await service.handleSchedulerTick()

    expect(standupDispatch.dispatchStandupJob).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      selectedRepos: ['repo-a'],
      gitAuthor: 'nitoba',
      timezone: 'America/Sao_Paulo',
      gitSincePeriod: '8 hours ago',
    })
  })

  it('releases stale runs and re-dispatches standup during recovery', async () => {
    isCronDueNowMock.mockImplementation(
      (expression: string) => expression === 'recovery-cron',
    )

    const releaseLock = vi.fn().mockResolvedValue(Result.ok(undefined))
    const standupDispatch = {
      dispatchStandupJob: vi.fn(),
    }
    const service = new WorkerSchedulerService(
      {
        config: { REPOS_ROOT_PATH: '/repos', SCHEDULER_ENABLED: true },
      } as never,
      {
        clearExpiredSnoozes: vi.fn().mockResolvedValue(Result.ok(0)),
        findAllActive: vi.fn().mockResolvedValue(Result.ok([makeSettings()])),
      } as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findStaleRuns: vi.fn().mockResolvedValue(Result.ok([{ id: 'run-1' }])),
        findByJobAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
        releaseLock,
      } as never,
      standupDispatch as never,
      { dispatchWeeklyDigestJob: vi.fn() } as never,
      { notifyReminder: vi.fn() } as never,
      { format: vi.fn().mockReturnValue('2026-03-13') } as never,
    )

    await service.handleSchedulerTick()

    expect(releaseLock).toHaveBeenCalledWith(
      'run-1',
      'failed',
      'Stale: process likely crashed',
    )
    expect(standupDispatch.dispatchStandupJob).toHaveBeenCalledTimes(1)
  })
})
