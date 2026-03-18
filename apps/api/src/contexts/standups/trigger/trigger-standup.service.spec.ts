import { BadRequestException, ConflictException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DbError, Result } from '../../../shared/domain'
import { TriggerStandupService } from './trigger-standup.service'

describe('TriggerStandupService', () => {
  function createDispatchMock() {
    return {
      dispatchStandupJob: vi.fn(),
    }
  }

  it('throws when it cannot resolve userId or discordUserId', async () => {
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      { findByUserId: vi.fn() } as never,
      { findLatestByUserAndDate: vi.fn() } as never,
      createDispatchMock() as never,
      { today: vi.fn() } as never,
    )

    await expect(service.trigger({}, null)).rejects.toThrow(BadRequestException)
  })

  it('throws when settings are missing', async () => {
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      { findByUserId: vi.fn().mockResolvedValue(Result.ok(null)) } as never,
      { findLatestByUserAndDate: vi.fn() } as never,
      createDispatchMock() as never,
      { today: vi.fn() } as never,
    )

    await expect(
      service.trigger({ userId: 'user-1', discordUserId: 'discord-1' }, null),
    ).rejects.toThrow(BadRequestException)
  })

  it('throws when selected repos are empty and no azureDevopsUser is configured', async () => {
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '[]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
            azureDevopsUser: null,
            azureDevopsUuid: null,
          }),
        ),
      } as never,
      { findLatestByUserAndDate: vi.fn() } as never,
      createDispatchMock() as never,
      { today: vi.fn() } as never,
    )

    await expect(
      service.trigger({ userId: 'user-1', discordUserId: 'discord-1' }, null),
    ).rejects.toThrow(BadRequestException)
  })

  it('does not throw when repos are empty but azureDevopsUser is configured', async () => {
    const dispatch = createDispatchMock()
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '[]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
            azureDevopsUser: 'john@company.com',
            azureDevopsUuid: 'uuid-123',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      dispatch as never,
      {
        today: vi
          .fn()
          .mockReturnValue({ iso: '2026-03-18', display: '18/03/2026' }),
      } as never,
    )

    await expect(
      service.trigger({ userId: 'user-1', discordUserId: 'discord-1' }, null),
    ).resolves.toEqual({ ok: true, accepted: true })

    expect(dispatch.dispatchStandupJob).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevopsUser: 'john@company.com',
        azureDevopsUuid: 'uuid-123',
        selectedRepos: [],
      }),
    )
  })

  it('forwards azureDevopsUser and azureDevopsUuid from settings to dispatch', async () => {
    const dispatch = createDispatchMock()
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '["repo-a"]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
            azureDevopsUser: 'john@company.com',
            azureDevopsUuid: 'resolved-uuid-456',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      dispatch as never,
      {
        today: vi
          .fn()
          .mockReturnValue({ iso: '2026-03-18', display: '18/03/2026' }),
      } as never,
    )

    await service.trigger(
      { userId: 'user-1', discordUserId: 'discord-1' },
      null,
    )

    expect(dispatch.dispatchStandupJob).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevopsUser: 'john@company.com',
        azureDevopsUuid: 'resolved-uuid-456',
      }),
    )
  })

  it('throws when a pending review standup already exists', async () => {
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '["repo-a"]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            status: 'pending_review',
          }),
        ),
      } as never,
      createDispatchMock() as never,
      {
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
      } as never,
    )

    await expect(
      service.trigger({ userId: 'user-1', discordUserId: 'discord-1' }, null),
    ).rejects.toThrow(ConflictException)
  })

  it('throws when today standup status cannot be evaluated', async () => {
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '["repo-a"]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(
          Result.err(
            new DbError({
              operation: 'findLatestByUserAndDate',
              message: 'db failed',
            }),
          ),
        ),
      } as never,
      createDispatchMock() as never,
      {
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
      } as never,
    )

    await expect(
      service.trigger({ userId: 'user-1', discordUserId: 'discord-1' }, null),
    ).rejects.toThrow(BadRequestException)
  })

  it('dispatches a regenerate job reusing a rejected standup by default', async () => {
    const dispatch = createDispatchMock()
    const service = new TriggerStandupService(
      { findDiscordIdByUserId: vi.fn() } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '["repo-a","repo-b"]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            status: 'rejected',
          }),
        ),
      } as never,
      dispatch as never,
      {
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
      } as never,
    )

    await expect(
      service.trigger(
        {
          userId: 'user-1',
          discordUserId: 'discord-1',
          extraContext: 'contexto',
        },
        null,
      ),
    ).resolves.toEqual({
      ok: true,
      accepted: true,
    })

    expect(dispatch.dispatchStandupJob).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      selectedRepos: ['repo-a', 'repo-b'],
      gitAuthor: 'nitoba',
      timezone: 'America/Sao_Paulo',
      gitSincePeriod: '8 hours ago',
      extraContext: 'contexto',
      forceRegenerate: true,
      rewriteFromStandupId: undefined,
      rewriteInstruction: undefined,
      replaceStandupId: 'standup-1',
      reuseExistingSource: true,
    })
  })

  it('uses the session user and explicit replace to bypass pending review conflict', async () => {
    const dispatch = createDispatchMock()
    const service = new TriggerStandupService(
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '["repo-a"]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            status: 'pending_review',
          }),
        ),
      } as never,
      dispatch as never,
      {
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
      } as never,
    )

    await expect(
      service.trigger(
        {
          forceRegenerate: true,
          replaceStandupId: 'standup-1',
        },
        { user: { id: 'user-1' } },
      ),
    ).resolves.toEqual({
      ok: true,
      accepted: true,
    })

    expect(dispatch.dispatchStandupJob).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      selectedRepos: ['repo-a'],
      gitAuthor: 'nitoba',
      timezone: 'America/Sao_Paulo',
      gitSincePeriod: '8 hours ago',
      extraContext: undefined,
      forceRegenerate: true,
      rewriteFromStandupId: undefined,
      rewriteInstruction: undefined,
      replaceStandupId: 'standup-1',
      reuseExistingSource: false,
    })
  })

  it('throws when settings are missing for a direct trigger call', async () => {
    const service = new TriggerStandupService(
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      { findLatestByUserAndDate: vi.fn() } as never,
      createDispatchMock() as never,
      { today: vi.fn() } as never,
    )

    await expect(
      service.trigger(
        {
          userId: 'user-1',
          discordUserId: 'discord-1',
        },
        null,
      ),
    ).rejects.toThrow(BadRequestException)
  })
})
