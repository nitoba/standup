import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { Result, ValidationError } from '../../../shared/domain'
import { RemindersController } from './reminders.controller'

describe('RemindersController', () => {
  it('returns 401 without session on snooze', async () => {
    const controller = new RemindersController(
      { snoozeReminder: vi.fn() } as never,
      { dispatchStandupJobForUser: vi.fn() } as never,
    )

    await expect(controller.snooze(null)).rejects.toThrow(UnauthorizedException)
  })

  it('returns 400 when run-now fails validation', async () => {
    const controller = new RemindersController(
      { snoozeReminder: vi.fn(), cancelReminderForToday: vi.fn() } as never,
      {
        dispatchStandupJobForUser: vi.fn().mockResolvedValue(
          Result.err(
            new ValidationError({
              field: 'userId',
              message: 'User settings not found',
            }),
          ),
        ),
      } as never,
    )

    await expect(controller.runNow({ user: { id: 'user-1' } })).rejects.toThrow(
      BadRequestException,
    )
  })

  it('returns data for snooze and cancel-today and accepts run-now', async () => {
    const reminderActions = {
      snoozeReminder: vi.fn().mockResolvedValue({
        ok: true,
        snoozedUntil: '2026-03-13T15:00:00.000Z',
      }),
      cancelReminderForToday: vi.fn().mockResolvedValue({
        ok: true,
        cancelledDate: '13/03/2026',
      }),
    }
    const standupDispatch = {
      dispatchStandupJobForUser: vi
        .fn()
        .mockResolvedValue(Result.ok(undefined)),
    }
    const controller = new RemindersController(
      reminderActions as never,
      standupDispatch as never,
    )

    await expect(
      controller.snooze({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      data: {
        ok: true,
        snoozedUntil: '2026-03-13T15:00:00.000Z',
      },
    })

    await expect(
      controller.cancelToday({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      data: {
        ok: true,
        cancelledDate: '13/03/2026',
      },
    })

    await expect(
      controller.runNow({ user: { id: 'user-1' } }),
    ).resolves.toEqual({
      ok: true,
      accepted: true,
    })
  })
})
