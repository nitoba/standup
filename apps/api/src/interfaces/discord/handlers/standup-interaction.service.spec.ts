import { describe, expect, it, vi } from 'vitest'
import { DbError, Result, ValidationError } from '../../../shared/domain'
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

  it('preserves DbError when actor session lookup fails', async () => {
    const service = new StandupInteractionService(
      {
        hasActiveSession: vi.fn().mockResolvedValue(
          Result.err(
            new DbError({
              operation: 'hasActiveSession',
              message: 'db down',
            }),
          ),
        ),
      } as never,
      {
        sendReviewDm: vi.fn(),
        updateDmMessage: vi.fn(),
      } as never,
      { approveResult: vi.fn() } as never,
      { transition: vi.fn() } as never,
    )

    const result = await service.handle('approve', 'standup-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(DbError.is(result.error)).toBe(true)
    }
  })

  it('returns ValidationError when actor has no active session', async () => {
    const service = new StandupInteractionService(
      {
        hasActiveSession: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      {
        sendReviewDm: vi.fn(),
        updateDmMessage: vi.fn(),
      } as never,
      { approveResult: vi.fn() } as never,
      { transition: vi.fn() } as never,
    )

    const result = await service.handle('approve', 'standup-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ValidationError.is(result.error)).toBe(true)
      if (ValidationError.is(result.error)) {
        expect(result.error.field).toBe('actorDiscordId')
      }
    }
  })
})
