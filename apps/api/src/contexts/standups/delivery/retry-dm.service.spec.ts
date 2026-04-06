import { describe, expect, it, vi } from 'vitest'
import {
  DbError,
  ExternalServiceError,
  Result,
  ValidationError,
} from '../../../shared/domain'
import { RetryDmService } from './retry-dm.service'

describe('RetryDmService', () => {
  function createService(overrides?: {
    standupRead?: Record<string, unknown>
    standupWrite?: Record<string, unknown>
    messages?: Record<string, unknown>
  }) {
    const standupRead = {
      findById: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          status: 'delivery_pending',
        }),
      ),
      ...overrides?.standupRead,
    }
    const standupWrite = {
      updateDmMessageId: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ id: 'standup-1', dmMessageId: 'msg-1' }),
        ),
      updateStatus: vi
        .fn()
        .mockResolvedValue(
          Result.ok({ id: 'standup-1', status: 'pending_review' }),
        ),
      ...overrides?.standupWrite,
    }
    const messages = {
      sendReviewDm: vi
        .fn()
        .mockResolvedValue(Result.ok({ messageId: 'msg-1' })),
      ...overrides?.messages,
    }

    return {
      standupRead,
      standupWrite,
      messages,
      service: new RetryDmService(
        {
          create: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          }),
        } as never,
        standupRead as never,
        standupWrite as never,
        messages as never,
      ),
    }
  }

  it('returns ExternalServiceError when review DM send fails', async () => {
    const { service } = createService({
      messages: {
        sendReviewDm: vi.fn().mockResolvedValue(
          Result.err(
            new ExternalServiceError({
              service: 'discord',
              message: 'discord offline',
            }),
          ),
        ),
      },
    })

    const result = await service.retryDm('standup-1', 'user-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
    }
  })

  it('preserves updateDmMessageId errors instead of ignoring them', async () => {
    const { service } = createService({
      standupWrite: {
        updateDmMessageId: vi.fn().mockResolvedValue(
          Result.err(
            new DbError({
              operation: 'updateDmMessageId',
              message: 'db full',
            }),
          ),
        ),
        updateStatus: vi.fn(),
      },
    })

    const result = await service.retryDm('standup-1', 'user-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(DbError.is(result.error)).toBe(true)
      expect(result.error.message).toBe('db full')
    }
  })

  it('returns ValidationError when standup is not delivery_pending', async () => {
    const { service } = createService({
      standupRead: {
        findById: vi
          .fn()
          .mockResolvedValue(
            Result.ok({ id: 'standup-1', status: 'approved' }),
          ),
      },
    })

    const result = await service.retryDm('standup-1', 'user-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ValidationError.is(result.error)).toBe(true)
      if (ValidationError.is(result.error)) {
        expect(result.error.field).toBe('status')
      }
    }
  })
})
