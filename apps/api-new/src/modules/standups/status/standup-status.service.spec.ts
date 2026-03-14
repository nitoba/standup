import { ConflictException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import {
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '../../../shared/domain'
import { StandupStatusService } from './standup-status.service'

describe('StandupStatusService', () => {
  it('updates the standup and emits a web status-change event', async () => {
    const eventBus = {
      emitStandupStatusChanged: vi.fn(),
    }
    const standupRepository = {
      updateStatusForUser: vi.fn().mockResolvedValue(
        Result.ok({
          id: 'standup-1',
          status: 'rejected',
        }),
      ),
    }
    const service = new StandupStatusService(
      standupRepository as never,
      eventBus as never,
    )

    await expect(
      service.update('user-1', 'standup-1', 'rejected'),
    ).resolves.toEqual({
      id: 'standup-1',
      status: 'rejected',
    })
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'rejected',
      source: 'web',
    })
  })

  it('maps repository errors to HTTP exceptions', async () => {
    const service = new StandupStatusService(
      {
        updateStatusForUser: vi
          .fn()
          .mockResolvedValueOnce(
            Result.err(
              new NotFoundError({ resource: 'standup', id: 'standup-1' }),
            ),
          )
          .mockResolvedValueOnce(
            Result.err(
              new InvalidStateTransitionError({
                from: 'draft',
                to: 'rejected',
              }),
            ),
          ),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
    )

    await expect(
      service.update('user-1', 'standup-1', 'draft'),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.update('user-1', 'standup-1', 'rejected'),
    ).rejects.toThrow(ConflictException)
  })
})
