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

  it('snoozes and cancels reminders directly', async () => {
    const service = createService()

    const snooze = await service.snoozeReminder('user-1')
    const cancel = await service.cancelReminderForToday('user-1')

    expect(snooze).toEqual({
      ok: true,
      snoozedUntil: expect.any(String),
    })
    expect(cancel).toEqual({
      ok: true,
      cancelledDate: '13/03/2026',
    })
  })
})
