import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { Result, ValidationError } from '../../../../shared/domain'
import { createControllerHttpTestApp } from '../../../../test/http/create-controller-http-test-app'
import { StandupDispatchService } from '../standup/standup-dispatch.service'
import { ReminderActionsService } from './reminder-actions.service'
import { RemindersController } from './reminders.controller'

@Controller('reminders')
class TestRemindersController extends RemindersController {
  constructor(
    @Inject(ReminderActionsService) reminderActions: ReminderActionsService,
    @Inject(StandupDispatchService) standupDispatch: StandupDispatchService,
  ) {
    super(reminderActions, standupDispatch)
  }
}

describe('RemindersController', () => {
  it('returns 401 without session on snooze', async () => {
    const testApp = await createControllerHttpTestApp({
      controllers: [TestRemindersController],
      providers: [
        {
          provide: ReminderActionsService,
          useValue: {
            snoozeReminder: vi.fn(),
            cancelReminderForToday: vi.fn(),
          },
        },
        {
          provide: StandupDispatchService,
          useValue: { dispatchStandupJobForUser: vi.fn() },
        },
      ],
    })

    try {
      const response = await testApp.request.post('/reminders/snooze')

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('returns 400 when run-now fails validation', async () => {
    const testApp = await createControllerHttpTestApp({
      controllers: [TestRemindersController],
      providers: [
        {
          provide: ReminderActionsService,
          useValue: {
            snoozeReminder: vi.fn(),
            cancelReminderForToday: vi.fn(),
          },
        },
        {
          provide: StandupDispatchService,
          useValue: {
            dispatchStandupJobForUser: vi.fn().mockResolvedValue(
              Result.err(
                new ValidationError({
                  field: 'userId',
                  message: 'User settings not found',
                }),
              ),
            ),
          },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/reminders/run-now')

      expect(response.status).toBe(400)
      expect(response.body.message).toBe('User settings not found')
    } finally {
      await testApp.close()
    }
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
    const testApp = await createControllerHttpTestApp({
      controllers: [TestRemindersController],
      providers: [
        {
          provide: ReminderActionsService,
          useValue: reminderActions,
        },
        {
          provide: StandupDispatchService,
          useValue: standupDispatch,
        },
      ],
    })

    try {
      const snoozeResponse = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/reminders/snooze')
      const cancelResponse = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/reminders/cancel-today')
      const runNowResponse = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/reminders/run-now')

      expect(snoozeResponse.status).toBe(200)
      expect(snoozeResponse.body).toEqual({
        data: {
          ok: true,
          snoozedUntil: '2026-03-13T15:00:00.000Z',
        },
      })
      expect(cancelResponse.status).toBe(200)
      expect(cancelResponse.body).toEqual({
        data: {
          ok: true,
          cancelledDate: '13/03/2026',
        },
      })
      expect(runNowResponse.status).toBe(202)
      expect(runNowResponse.body).toEqual({
        ok: true,
        accepted: true,
      })
    } finally {
      await testApp.close()
    }
  })
})
