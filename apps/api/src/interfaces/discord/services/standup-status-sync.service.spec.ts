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

  it('updates DM message when standup is approved', async () => {
    const updateDmMessage = vi.fn().mockResolvedValue(Result.ok(undefined))
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
      } as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        updateDmMessage,
      } as never,
    )

    const result = await service.syncStatus({
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'web',
    })

    expect(result.isOk()).toBe(true)
    expect(updateDmMessage).toHaveBeenCalledWith({
      discordUserId: 'discord-1',
      messageId: 'dm-1',
      payload: {
        content: '✅ Aprovado via web',
        components: [],
      },
    })
  })

  it('updates DM message when standup is rejected', async () => {
    const updateDmMessage = vi.fn().mockResolvedValue(Result.ok(undefined))
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
      } as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        updateDmMessage,
      } as never,
    )

    const result = await service.syncStatus({
      standupId: 'standup-1',
      newStatus: 'rejected',
      source: 'discord',
    })

    expect(result.isOk()).toBe(true)
    expect(updateDmMessage).toHaveBeenCalledWith({
      discordUserId: 'discord-1',
      messageId: 'dm-1',
      payload: {
        content: '❌ Rejeitado',
        components: [],
      },
    })
  })
})
