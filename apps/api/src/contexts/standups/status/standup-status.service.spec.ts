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
          date: '2026-03-13',
          status: 'rejected',
        }),
      ),
    }
    const service = new StandupStatusService(
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
      service.update('user-1', 'standup-1', 'rejected'),
    ).resolves.toEqual({
      id: 'standup-1',
      date: '13/03/2026',
      status: 'rejected',
    })
    expect(eventBus.emitStandupStatusChanged).toHaveBeenCalledWith({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'rejected',
      source: 'web',
    })
  })

  it('rethrows repository tagged errors for the HTTP boundary to normalize', async () => {
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
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
      } as never,
      { emitStandupStatusChanged: vi.fn() } as never,
      {
        resolve: vi.fn().mockResolvedValue('America/Sao_Paulo'),
      } as never,
    )

    await expect(
      service.update('user-1', 'standup-1', 'draft'),
    ).rejects.toSatisfy(NotFoundError.is)
    await expect(
      service.update('user-1', 'standup-1', 'rejected'),
    ).rejects.toSatisfy(InvalidStateTransitionError.is)
  })
})
