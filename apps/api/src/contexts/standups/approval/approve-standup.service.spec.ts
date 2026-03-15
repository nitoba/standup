import { ConflictException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '../../../shared/domain'
import { ApproveStandupService } from './approve-standup.service'

describe('ApproveStandupService', () => {
  it('approves a standup and emits a web status-change event', async () => {
    const standupRepository = {
      findByIdForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          content: '**Standup**',
          meetingType: '📆 (Planning)',
        }),
      ),
      updateCustomEntriesForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          content: '**Standup**',
          meetingType: '📆 (Planning)',
        }),
      ),
      updateContentForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          content: '**Standup**\n📆 (Retro)',
          meetingType: '📆 (Planning)',
        }),
      ),
      updateStatusForUser: vi.fn().mockResolvedValue(
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
      {
        findByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok({ timezone: 'America/Fortaleza' })),
      } as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      eventBus as never,
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
    expect(standupRepository.updateCustomEntriesForUser).toHaveBeenCalled()
    expect(standupRepository.updateContentForUser).toHaveBeenCalled()
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'web',
    })
  })

  it('skips custom-entry persistence when there are no extra entries', async () => {
    const standupRepository = {
      findByIdForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          content: '**Standup**',
          meetingType: '',
        }),
      ),
      updateCustomEntriesForUser: vi.fn(),
      updateContentForUser: vi.fn(),
      updateStatusForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          date: '2026-03-13',
          status: 'approved',
        }),
      ),
    }
    const service = new ApproveStandupService(
      standupRepository as never,
      {
        findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
    )

    await service.approve('user-1', 'standup-1', {
      scheduledMeetings: [],
      directCalls: [],
    })

    expect(standupRepository.updateCustomEntriesForUser).not.toHaveBeenCalled()
    expect(standupRepository.updateContentForUser).not.toHaveBeenCalled()
  })

  it('maps repository errors to HTTP exceptions', async () => {
    const service = new ApproveStandupService(
      {
        findByIdForUser: vi
          .fn()
          .mockResolvedValueOnce(
            Result.err(
              new NotFoundError({ resource: 'standup', id: 'standup-1' }),
            ),
          )
          .mockResolvedValueOnce(
            Result.ok({
              id: 'standup-1',
              content: '**Standup**',
              meetingType: '',
            }),
          ),
        updateCustomEntriesForUser: vi.fn(),
        updateContentForUser: vi.fn(),
        updateStatusForUser: vi.fn().mockResolvedValue(
          Result.err(
            new InvalidStateTransitionError({
              from: 'draft',
              to: 'approved',
            }),
          ),
        ),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
    )

    await expect(service.approve('user-1', 'standup-1')).rejects.toThrow(
      NotFoundException,
    )
    await expect(service.approve('user-1', 'standup-1')).rejects.toThrow(
      ConflictException,
    )
  })
})
