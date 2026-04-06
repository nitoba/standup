import { describe, expect, it, vi } from 'vitest'
import {
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '../../../shared/domain'
import { ApproveStandupService } from './approve-standup.service'

describe('ApproveStandupService', () => {
  it('approves a standup and emits a web status-change event', async () => {
    // approveForUser is the single atomic operation that replaces the
    // three separate writes (TAS-57)
    const standupRepository = {
      findByIdForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          content: '**Standup**',
          meetingType: '📆 (Planning)',
        }),
      ),
      approveForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          date: '2026-03-13',
          status: 'approved',
        }),
      ),
    }
    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }
    const service = new ApproveStandupService(
      standupRepository as never,
      standupRepository as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      eventBus as never,
      {
        resolve: vi.fn().mockResolvedValue('America/Fortaleza'),
      } as never,
    )

    await expect(
      service.approve('user-1', 'standup-1', {
        scheduledMeetings: ['Retro'],
        directCalls: [],
      }),
    ).resolves.toEqual({
      id: 'standup-1',
      date: '13/03/2026',
      status: 'approved',
    })
    expect(standupRepository.approveForUser).toHaveBeenCalledWith(
      'standup-1',
      'user-1',
      expect.any(String), // mergedContent
      expect.objectContaining({ scheduledMeetings: ['Retro'] }),
    )
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'web',
    })
  })

  it('approves a standup through the internal result API with a discord source', async () => {
    const standupRepository = {
      findByIdForUser: vi.fn(),
      approveForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          userId: 'user-1',
          date: '2026-03-13',
          status: 'approved',
        }),
      ),
    }
    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }
    const service = new ApproveStandupService(
      standupRepository as never,
      standupRepository as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      eventBus as never,
      {
        resolve: vi.fn().mockResolvedValue('America/Sao_Paulo'),
      } as never,
    )

    const result = await service.approveResult(
      'user-1',
      'standup-1',
      null,
      'discord',
    )

    expect(result.isOk()).toBe(true)
    expect(standupRepository.approveForUser).toHaveBeenCalledWith(
      'standup-1',
      'user-1',
      null,
      null,
    )
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'discord',
    })
  })

  it('skips custom-entry merge when entries are empty', async () => {
    const standupRepository = {
      findByIdForUser: vi.fn(),
      approveForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          date: '2026-03-13',
          status: 'approved',
        }),
      ),
    }
    const service = new ApproveStandupService(
      standupRepository as never,
      standupRepository as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
      {
        resolve: vi.fn().mockResolvedValue('America/Sao_Paulo'),
      } as never,
    )

    await service.approve('user-1', 'standup-1', {
      scheduledMeetings: [],
      directCalls: [],
    })

    // When entries are empty, findByIdForUser is not called for merge and
    // approveForUser is called with null content and null entries
    expect(standupRepository.findByIdForUser).not.toHaveBeenCalled()
    expect(standupRepository.approveForUser).toHaveBeenCalledWith(
      'standup-1',
      'user-1',
      null,
      null,
    )
  })

  it('rethrows repository tagged errors for the HTTP boundary to normalize', async () => {
    const repo = {
      findByIdForUser: vi
        .fn()
        .mockResolvedValueOnce(
          Result.err(
            new NotFoundError({ resource: 'standup', id: 'standup-1' }),
          ),
        ),
      approveForUser: vi.fn().mockResolvedValue(
        Result.err(
          new InvalidStateTransitionError({
            from: 'draft',
            to: 'approved',
          }),
        ),
      ),
    }
    const service = new ApproveStandupService(
      repo as never,
      repo as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
      {
        resolve: vi.fn().mockResolvedValue('America/Sao_Paulo'),
      } as never,
    )

    // First call: findByIdForUser returns NotFoundError (when customEntries provided)
    await expect(
      service.approve('user-1', 'standup-1', {
        scheduledMeetings: ['Retro'],
        directCalls: [],
      }),
    ).rejects.toSatisfy(NotFoundError.is)

    // Second call: approveForUser returns InvalidStateTransitionError
    await expect(service.approve('user-1', 'standup-1')).rejects.toSatisfy(
      InvalidStateTransitionError.is,
    )
  })
})
