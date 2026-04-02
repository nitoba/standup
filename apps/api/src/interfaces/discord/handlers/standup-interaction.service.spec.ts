import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { StandupInteractionService } from './standup-interaction.service'

describe('StandupInteractionService', () => {
  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        warn: vi.fn(),
      })),
    }
  }

  it('delegates approve to standup-owned approval and publication services', async () => {
    const approveResult = vi.fn().mockResolvedValue(
      Result.ok({
        id: 'standup-1',
        userId: 'user-1',
        date: '2026-03-13',
        status: 'approved',
      }),
    )
    const publish = vi.fn().mockResolvedValue(
      Result.ok({
        id: 'standup-1',
        userId: 'user-1',
        date: '2026-03-13',
        status: 'published',
      }),
    )
    const service = new StandupInteractionService(
      makeLoggerFactory() as never,
      {
        findByIdForUser: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            userId: 'user-1',
            date: '2026-03-13',
            content: 'conteudo',
            status: 'approved',
          }),
        ),
      } as never,
      {
        hasActiveSession: vi
          .fn()
          .mockResolvedValue(Result.ok({ hasSession: true, userId: 'user-1' })),
      } as never,
      {
        publishStandup: vi.fn().mockResolvedValue(Result.ok({})),
      } as never,
      { discord: { channelId: 'channel-1' } } as never,
      { approveResult } as never,
      { publish } as never,
      { transition: vi.fn() } as never,
      { destroy: vi.fn() } as never,
    )

    const result = await service.handle('approve', 'standup-1', 'discord-1')

    expect(result.isOk()).toBe(true)
    expect(approveResult).toHaveBeenCalledWith(
      'user-1',
      'standup-1',
      undefined,
      'discord',
    )
    expect(publish).toHaveBeenCalledWith('user-1', 'standup-1', 'discord')
  })
})
