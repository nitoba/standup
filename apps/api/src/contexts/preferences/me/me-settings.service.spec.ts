import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DbError,
  ExternalServiceError,
  Result,
  ValidationError,
} from '../../../shared/domain'
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
    azureDevopsUuid: null,
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
    const azureDevopsRestClient = {
      resolveIdentity: vi.fn(),
    }

    return {
      loggerFactory,
      userSettingsRepository,
      azureDevopsRestClient,
      service: new MeSettingsService(
        loggerFactory as never,
        userSettingsRepository as never,
        {
          formatIsoForTimezone: vi.fn((value: string) =>
            value === '2026-03-13' ? '13/03/2026' : value,
          ),
        } as never,
        eventBus as never,
        azureDevopsRestClient as never,
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
      azureDevopsUuid: null,
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
        azureDevopsUuid: 'some-uuid',
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
      azureDevopsUuid: 'some-uuid',
    })
  })

  it('rethrows DbError when loading settings fails', async () => {
    const { service, userSettingsRepository } = createService()
    userSettingsRepository.findByUserId.mockResolvedValue(
      Result.err(new DbError({ operation: 'findByUserId', message: 'disk' })),
    )

    await expect(service.get('user-1')).rejects.toSatisfy(DbError.is)
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
        azureDevopsUuid: null,
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
      azureDevopsUuid: null,
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
      azureDevopsUuid: null,
    })
  })

  it('throws ValidationError when neither git source nor board source is configured', async () => {
    const { service } = createService()

    await expect(
      service.put('user-1', {
        standupCron: '1',
        reminderCron: '2',
        recoveryCron: '3',
        timezone: 'America/Fortaleza',
      }),
    ).rejects.toSatisfy(ValidationError.is)
  })

  it('allows board-only configuration without git repos', async () => {
    const { service, userSettingsRepository, azureDevopsRestClient } =
      createService()
    userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))
    azureDevopsRestClient.resolveIdentity.mockResolvedValue(
      Result.ok({ id: 'devops-uuid', displayName: 'Devops User' }),
    )
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
        azureDevopsUuid: 'devops-uuid',
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

  describe('azureDevopsUuid resolution', () => {
    const userId = 'user-1'
    const validBody = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: 'author@test.com',
      selectedRepos: ['AGROTRACE/some-repo'],
      azureDevopsUser: 'john@company.com',
    }
    const existingSettings = makeSettingsRow()

    it('should resolve UUID when azureDevopsUser is provided and changed', async () => {
      const { service, userSettingsRepository, azureDevopsRestClient } =
        createService()
      azureDevopsRestClient.resolveIdentity.mockResolvedValue(
        Result.ok({ id: 'resolved-uuid', displayName: 'John Doe' }),
      )
      userSettingsRepository.findByUserId.mockResolvedValue(
        Result.ok({ ...existingSettings, azureDevopsUser: 'old-user' }),
      )
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(
          makeSettingsRow({
            azureDevopsUser: 'john@company.com',
            azureDevopsUuid: 'resolved-uuid',
          }),
        ),
      )

      await service.put(userId, validBody)

      expect(azureDevopsRestClient.resolveIdentity).toHaveBeenCalledWith(
        'john@company.com',
      )
      expect(userSettingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          azureDevopsUser: 'john@company.com',
          azureDevopsUuid: 'resolved-uuid',
        }),
      )
    })

    it('should rethrow ExternalServiceError when user is not found in Azure DevOps', async () => {
      const { service, userSettingsRepository, azureDevopsRestClient } =
        createService()
      azureDevopsRestClient.resolveIdentity.mockResolvedValue(
        Result.err(
          new ExternalServiceError({
            service: 'azure-devops',
            message: "No Azure DevOps user found matching 'nobody@x.com'",
          }),
        ),
      )
      userSettingsRepository.findByUserId.mockResolvedValue(Result.ok(null))

      await expect(
        service.put(userId, { ...validBody, azureDevopsUser: 'nobody@x.com' }),
      ).rejects.toSatisfy(ExternalServiceError.is)
    })

    it('should clear both fields when azureDevopsUser is empty', async () => {
      const { service, userSettingsRepository, azureDevopsRestClient } =
        createService()
      userSettingsRepository.findByUserId.mockResolvedValue(
        Result.ok({
          ...existingSettings,
          azureDevopsUser: 'old-user',
          azureDevopsUuid: 'old-uuid',
        }),
      )
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(makeSettingsRow()),
      )

      await service.put(userId, { ...validBody, azureDevopsUser: '' })

      expect(azureDevopsRestClient.resolveIdentity).not.toHaveBeenCalled()
      expect(userSettingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          azureDevopsUser: null,
          azureDevopsUuid: null,
        }),
      )
    })

    it('should skip lookup when azureDevopsUser has not changed', async () => {
      const { service, userSettingsRepository, azureDevopsRestClient } =
        createService()
      userSettingsRepository.findByUserId.mockResolvedValue(
        Result.ok({
          ...existingSettings,
          azureDevopsUser: 'same@company.com',
          azureDevopsUuid: 'existing-uuid',
        }),
      )
      userSettingsRepository.upsert.mockResolvedValue(
        Result.ok(
          makeSettingsRow({
            azureDevopsUser: 'same@company.com',
            azureDevopsUuid: 'existing-uuid',
          }),
        ),
      )

      await service.put(userId, {
        ...validBody,
        azureDevopsUser: 'same@company.com',
      })

      expect(azureDevopsRestClient.resolveIdentity).not.toHaveBeenCalled()
      expect(userSettingsRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          azureDevopsUser: 'same@company.com',
          azureDevopsUuid: 'existing-uuid',
        }),
      )
    })
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
