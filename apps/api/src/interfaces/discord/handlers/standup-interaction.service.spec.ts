import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { StandupInteractionService } from './standup-interaction.service'

describe('StandupInteractionService', () => {
  it('delegates approve to standup-owned approval service without publishing', async () => {
    const approveResult = vi.fn().mockResolvedValue(
      Result.ok({
        id: 'standup-1',
        userId: 'user-1',
        date: '2026-03-13',
        status: 'approved',
      }),
    )
    const service = new StandupInteractionService(
      {
        hasActiveSession: vi
          .fn()
          .mockResolvedValue(Result.ok({ hasSession: true, userId: 'user-1' })),
      } as never,
      {
        sendReviewDm: vi.fn(),
        updateDmMessage: vi.fn(),
      } as never,
      { approveResult } as never,
      { transition: vi.fn() } as never,
    )

    const result = await service.handle('approve', 'standup-1', 'discord-1')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.newStatus).toBe('approved')
    }
    expect(approveResult).toHaveBeenCalledWith(
      'user-1',
      'standup-1',
      undefined,
      'discord',
    )
  })
})
