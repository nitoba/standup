import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Result, ValidationError } from '@standup/domain'
import {
  WORKER_REMINDER_ACTION_REQUESTED_EVENT,
  type WorkerReminderActionRequestedEvent,
} from '../../events/standup-events'
import { ReminderActionsService } from './reminder-actions.service'

type ReminderActionOutcome =
  | { ok: true; snoozedUntil: string }
  | { ok: true; cancelledDate: string }

@Injectable()
export class WorkerReminderActionRequestedListener {
  constructor(private readonly reminderActions: ReminderActionsService) {}

  @OnEvent(WORKER_REMINDER_ACTION_REQUESTED_EVENT)
  async handle(
    event: WorkerReminderActionRequestedEvent,
  ): Promise<Result<ReminderActionOutcome, ValidationError>> {
    if (event.action === 'snooze') {
      return Result.ok(await this.reminderActions.snoozeReminder(event.userId))
    }

    if (event.action === 'cancel-today') {
      return Result.ok(
        await this.reminderActions.cancelReminderForToday(event.userId),
      )
    }

    return Result.err(
      new ValidationError({
        field: 'action',
        message: `Unknown reminder action: ${event.action}`,
      }),
    )
  }
}
