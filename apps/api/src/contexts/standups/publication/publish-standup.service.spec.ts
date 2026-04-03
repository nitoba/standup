import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { PublishStandupService } from './publish-standup.service'

describe('PublishStandupService', () => {
  it('marks an approved standup as published after channel delivery succeeds', async () => {
    const standupRepository = {
      updateStatusForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          status: 'published',
        }),
      ),
    }
    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }
    const service = new PublishStandupService(
      standupRepository as never,
      eventBus as never,
    )

    const result = await service.publish('user-1', 'standup-1', 'discord')

    expect(result.isOk()).toBe(true)
    expect(standupRepository.updateStatusForUser).toHaveBeenCalledWith(
      'standup-1',
      'user-1',
      'published',
    )
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'published',
      source: 'discord',
    })
  })
})
