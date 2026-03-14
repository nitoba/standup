import { InternalServerErrorException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DbError, Result } from '../../../shared/domain'
import { MeSettingsService } from './me-settings.service'

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
      cancelledDate: '2026-03-13',
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
    })
  })
})
