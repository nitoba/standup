import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { StandupNotificationService } from './standup-notification.service'

describe('StandupNotificationService', () => {
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

  it('sends the review DM, persists dmMessageId and emits pending_review', async () => {
    const standupRepository = {
      findById: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          meetingType: 'daily',
          content: 'conteudo',
          sourceData: '{}',
          customEntries: null,
          status: 'draft',
          dmMessageId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
      updateDmMessageId: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          meetingType: 'daily',
          content: 'conteudo',
          sourceData: '{}',
          customEntries: null,
          status: 'draft',
          dmMessageId: 'message-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
      updateStatus: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          meetingType: 'daily',
          content: 'conteudo',
          sourceData: '{}',
          customEntries: null,
          status: 'pending_review',
          dmMessageId: 'message-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
    }

    const messages = {
      sendReviewDm: vi
        .fn()
        .mockResolvedValue(Result.ok({ messageId: 'message-1' })),
    }

    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }

    const service = new StandupNotificationService(
      makeLoggerFactory() as never,
      standupRepository as never,
      messages as never,
      eventBus as never,
    )

    const result = await service.notifyStandupReady('standup-1', 'discord-1')

    expect(result.isOk()).toBe(true)
    if (result.isErr()) {
      throw result.error
    }
    expect(result.value).toEqual({
      standupId: 'standup-1',
      dmSent: true,
      transitioned: true,
    })
    expect(standupRepository.updateDmMessageId).toHaveBeenCalledWith(
      'standup-1',
      'message-1',
    )
    expect(standupRepository.updateStatus).toHaveBeenCalledWith(
      'standup-1',
      'pending_review',
    )
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'pending_review',
      source: 'worker',
    })
  })

  it('does not transition when sending the review DM fails', async () => {
    const standupRepository = {
      findById: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          meetingType: 'daily',
          content: 'conteudo',
          sourceData: '{}',
          customEntries: null,
          status: 'draft',
          dmMessageId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
      updateDmMessageId: vi.fn(),
      updateStatus: vi.fn(),
    }

    const messages = {
      sendReviewDm: vi.fn().mockResolvedValue(
        Result.err(
          new Error('boom') as unknown as {
            readonly name: 'ExternalServiceError'
            readonly message: string
          },
        ),
      ),
    }

    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }

    const service = new StandupNotificationService(
      makeLoggerFactory() as never,
      standupRepository as never,
      messages as never,
      eventBus as never,
    )

    const result = await service.notifyStandupReady('standup-1', 'discord-1')

    expect(result.isOk()).toBe(true)
    if (result.isErr()) {
      throw result.error
    }
    expect(result.value).toEqual({
      standupId: 'standup-1',
      dmSent: false,
      transitioned: false,
    })
    expect(standupRepository.updateDmMessageId).not.toHaveBeenCalled()
    expect(standupRepository.updateStatus).not.toHaveBeenCalled()
    expect(eventBus.emitStandupStatusChanged).not.toHaveBeenCalled()
  })
})
