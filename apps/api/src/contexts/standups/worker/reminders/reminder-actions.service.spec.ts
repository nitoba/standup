import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { ReminderActionsService } from './reminder-actions.service'

describe('ReminderActionsService', () => {
  function createService() {
    return new ReminderActionsService(
      {
        updateSnoozedUntil: vi.fn().mockResolvedValue(Result.ok(undefined)),
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            timezone: 'America/Fortaleza',
          }),
        ),
        updateCancelledDate: vi.fn().mockResolvedValue(Result.ok(undefined)),
      } as never,
      { notifyStandupReminder: vi.fn() } as never,
      {
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
      } as never,
    )
  }

  it('handles snooze and cancel reminder actions from the event bus', async () => {
    const service = createService()

    const snooze = await service.handleRequestedAction({
      action: 'snooze',
      userId: 'user-1',
    })
    const cancel = await service.handleRequestedAction({
      action: 'cancel-today',
      userId: 'user-1',
    })

    expect(snooze.isOk()).toBe(true)
    expect(cancel.isOk()).toBe(true)
  })

  it('returns validation error for unknown actions', async () => {
    const service = createService()

    const result = await service.handleRequestedAction({
      action: 'unknown' as 'snooze',
      userId: 'user-1',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('Unknown reminder action')
    }
  })
})
