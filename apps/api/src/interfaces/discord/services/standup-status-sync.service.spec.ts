import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { StandupStatusSyncService } from './standup-status-sync.service'

describe('StandupStatusSyncService', () => {
  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        warn: vi.fn(),
      })),
    }
  }

  it('publishes approved standups and delegates the published transition back to standups', async () => {
    const publish = vi.fn().mockResolvedValue(
      Result.ok({
        id: 'standup-1',
        userId: 'user-1',
        date: '2026-03-13',
        status: 'published',
      }),
    )
    const service = new StandupStatusSyncService(
      makeLoggerFactory() as never,
      {
        findById: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            userId: 'user-1',
            dmMessageId: 'dm-1',
            content: 'conteudo',
            date: '2026-03-13',
            status: 'approved',
          }),
        ),
        updateStatus: vi.fn(),
      } as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        updateDmMessage: vi.fn().mockResolvedValue(Result.ok(undefined)),
        publishStandup: vi.fn().mockResolvedValue(Result.ok(undefined)),
      } as never,
      { discord: { channelId: 'channel-1' } } as never,
      { publish } as never,
    )

    const result = await service.syncStatus({
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'web',
    })

    expect(result.isOk()).toBe(true)
    expect(publish).toHaveBeenCalledWith('user-1', 'standup-1', 'web')
  })
})
