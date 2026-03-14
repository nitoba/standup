import { Result } from '@standup/domain'
import { describe, expect, it, vi } from 'vitest'
import { StandupDispatchService } from './standup-dispatch.service'

describe('StandupDispatchService', () => {
  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      })),
    }
  }

  it('returns validation error when settings are missing', async () => {
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      { findDiscordIdByUserId: vi.fn() } as never,
      { findByUserId: vi.fn().mockResolvedValue(Result.ok(null)) } as never,
      { run: vi.fn() } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toBe('User settings not found')
    }
  })

  it('returns validation error when discord identity is missing', async () => {
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      {
        findDiscordIdByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
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
      { run: vi.fn() } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toBe('Discord identity not found')
    }
  })

  it('returns validation error when selected repos are empty', async () => {
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '[]',
            gitAuthor: 'nitoba',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      { run: vi.fn() } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toBe('No repositories selected')
    }
  })

  it('dispatches the standup job with the resolved user settings', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
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
      { run } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isOk()).toBe(true)
    expect(run).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      selectedRepos: ['repo-a', 'repo-b'],
      gitAuthor: 'nitoba',
      timezone: 'America/Sao_Paulo',
      gitSincePeriod: '8 hours ago',
    })
  })

  it('handles standup dispatch requests from the event bus', () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      { findDiscordIdByUserId: vi.fn() } as never,
      { findByUserId: vi.fn() } as never,
      { run } as never,
    )

    expect(
      service.handleRequestedDispatch({
        userId: 'user-1',
        discordUserId: 'discord-1',
        selectedRepos: ['repo-a'],
        gitAuthor: 'nitoba',
        timezone: 'America/Sao_Paulo',
      }),
    ).toEqual({ ok: true })

    expect(run).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      selectedRepos: ['repo-a'],
      gitAuthor: 'nitoba',
      timezone: 'America/Sao_Paulo',
    })
  })
})
