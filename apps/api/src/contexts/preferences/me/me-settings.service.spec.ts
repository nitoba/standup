import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbError, Result } from '../../../shared/domain'
import { MeSettingsService } from './me-settings.service'

const emitSettingsReposChanged = vi.fn()
const eventBus = { emitSettingsReposChanged }

function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'America/Sao_Paulo',
    gitAuthor: 'author@test.com',
    gitSincePeriod: '8 hours ago',
    selectedRepos: '[]',
    active: true,
    emailTheme: 'dark',
    snoozedUntil: null,
    cancelledDate: null,
    azureDevopsUser: null,
    ...overrides,
  }
}

describe('MeSettingsService', () => {
  function createService() {
    const loggerFactory = {
      create: vi.fn().mockReturnValue({
        error: vi.fn(),
      }),
    }
    const userSettingsRepository = {
      findByUserId: vi.fn(),
      upsert: vi.fn(),
    }

    return {
      loggerFactory,
      userSettingsRepository,
      service: new MeSettingsService(
        loggerFactory as never,
        userSettingsRepository as never,
        {
          formatIsoForTimezone: vi.fn((value: string) =>
            value === '2026-03-13' ? '13/03/2026' : value,
          ),
        } as never,
        eventBus as never,
      ),
    }
  }

  it('returns defaults when settings do not exist', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))

    await expect(service.get('user-1')).resolves.toEqual({
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: '',
      gitSincePeriod: '8 hours ago',
      selectedRepos: [],
      active: true,
      emailTheme: 'dark',
      snoozedUntil: null,
      cancelledDate: null,
      azureDevopsUser: null,
    })
  })

  it('maps persisted settings to API shape', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(
      Result.ok({
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
        gitAuthor: 'user@example.com',
        gitSincePeriod: '4 hours ago',
        selectedRepos: '["repo-1","repo-2"]',
        active: false,
        emailTheme: 'light',
        snoozedUntil: 10,
        cancelledDate: '2026-03-13',
        azureDevopsUser: 'devops-user',
      }),
    )

    await expect(service.get('user-1')).resolves.toEqual({
      standupCron: '1',
      reminderCron: '2',
      recoveryCron: '3',
      timezone: 'America/Fortaleza',
      gitAuthor: 'user@example.com',
      gitSincePeriod: '4 hours ago',
      selectedRepos: ['repo-1', 'repo-2'],
      active: false,
      emailTheme: 'light',
      snoozedUntil: 10,
      cancelledDate: '13/03/2026',
      azureDevopsUser: 'devops-user',
    })
  })

  it('throws 500 when loading settings fails', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(
      Result.err(new DbError({ operation: 'findByUserId', message: 'disk' })),
    )

    await expect(service.get('user-1')).rejects.toThrow(
      InternalServerErrorException,
    )
  })

  it('persists settings and returns the normalized payload', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))
    userSettingsRepository.upsert.mockResolvedValue(
      Result.ok({
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
        gitAuthor: 'user@example.com',
        gitSincePeriod: '5 hours ago',
        selectedRepos: '["repo-1"]',
        active: true,
        emailTheme: 'dark',
        snoozedUntil: null,
        cancelledDate: null,
        azureDevopsUser: null,
      }),
    )

    await expect(
      service.put('user-1', {
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
        gitAuthor: 'user@example.com',
        selectedRepos: ['repo-1'],
      }),
    ).resolves.toEqual({
      standupCron: '1',
      reminderCron: '2',
      recoveryCron: '3',
      timezone: 'America/Fortaleza',
      gitAuthor: 'user@example.com',
      gitSincePeriod: '5 hours ago',
      selectedRepos: ['repo-1'],
      active: true,
      emailTheme: 'dark',
      snoozedUntil: null,
      cancelledDate: null,
      azureDevopsUser: null,
    })
    expect(userSettingsRepository.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      standupCron: '1',
      reminderCron: '2',
      recoveryCron: '3',
      timezone: 'America/Fortaleza',
      gitAuthor: 'user@example.com',
      gitSincePeriod: '8 hours ago',
      selectedRepos: '["repo-1"]',
      azureDevopsUser: null,
    })
  })

  it('throws BadRequest when neither git source nor board source is configured', async () => {
    const { service } = createService()

    await expect(
      service.put('user-1', {
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('allows board-only configuration without git repos', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))
    userSettingsRepository.upsert.mockResolvedValue(
      Result.ok({
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
        gitAuthor: '',
        gitSincePeriod: '8 hours ago',
        selectedRepos: '[]',
        active: true,
        emailTheme: 'dark',
        snoozedUntil: null,
        cancelledDate: null,
        azureDevopsUser: 'devops-user',
      }),
    )

    await expect(
      service.put('user-1', {
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
        azureDevopsUser: 'devops-user',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        azureDevopsUser: 'devops-user',
        gitAuthor: '',
        selectedRepos: [],
      }),
    )
  })

  describe('put — event emission', () => {
    const putBody = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: 'author@test.com',
      selectedRepos: ['AGROTRACE/old-repo', 'AGROTRACE/new-repo'],
    }

    beforeEach(() => {
      emitSettingsReposChanged.mockClear()
    })

    it('emits SETTINGS_REPOS_CHANGED_EVENT when new repos are added', async () => {
      const { userSettingsRepository, service } = createService()
      userSettingsRepository.findByUserId.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/old-repo"]' })),
      )
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(
          makeSettingsRow({
            selectedRepos: '["AGROTRACE/old-repo","AGROTRACE/new-repo"]',
          }),
        ),
      )

      await service.put('user-1', putBody as never)

      expect(emitSettingsReposChanged).toHaveBeenCalledWith({
        userId: 'user-1',
        selectedRepos: ['AGROTRACE/new-repo'],
      })
    })

    it('does NOT emit event when repos have not changed', async () => {
      const { userSettingsRepository, service } = createService()
      userSettingsRepository.findByUserId.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )

      await service.put('user-1', {
        ...putBody,
        selectedRepos: ['AGROTRACE/repo-a'],
      } as never)

      expect(emitSettingsReposChanged).not.toHaveBeenCalled()
    })

    it('emits all repos as new when user has no previous settings', async () => {
      const { userSettingsRepository, service } = createService()
      userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )

      await service.put('user-1', {
        ...putBody,
        selectedRepos: ['AGROTRACE/repo-a'],
      } as never)

      expect(emitSettingsReposChanged).toHaveBeenCalledWith({
        userId: 'user-1',
        selectedRepos: ['AGROTRACE/repo-a'],
      })
    })
  })
})
