import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { UserSettingsRepository } from '../../../shared/module/database/repositories/user-settings.repository'
import { Result, ValidationError } from '../../../shared/domain'
import { LocalDateService } from '../../../shared/time/local-date.service'
import {
  WORKER_REMINDER_ACTION_REQUESTED_EVENT,
  type WorkerReminderActionRequestedEvent,
} from '../../events/standup-events'
import { WorkerEventPublisherService } from '../worker-event-publisher.service'

type ReminderActionOutcome =
  | { ok: true; snoozedUntil: string }
  | { ok: true; cancelledDate: string }

@Injectable()
export class ReminderActionsService {
  constructor(
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly notifications: WorkerEventPublisherService,
    private readonly localDateService: LocalDateService,
  ) {}

  @OnEvent(WORKER_REMINDER_ACTION_REQUESTED_EVENT)
  async handleRequestedAction(
    event: WorkerReminderActionRequestedEvent,
  ): Promise<Result<ReminderActionOutcome, ValidationError>> {
    if (event.action === 'snooze') {
      return Result.ok(await this.snoozeReminder(event.userId))
    }

    if (event.action === 'cancel-today') {
      return Result.ok(await this.cancelReminderForToday(event.userId))
    }

    return Result.err(
      new ValidationError({
        field: 'action',
        message: `Unknown reminder action: ${event.action}`,
      }),
    )
  }

  async snoozeReminder(
    userId: string,
  ): Promise<{ ok: true; snoozedUntil: string }> {
    const snoozedUntil = Date.now() + 15 * 60 * 1000
    await this.userSettingsRepository.updateSnoozedUntil(userId, snoozedUntil)

    return {
      ok: true,
      snoozedUntil: new Date(snoozedUntil).toISOString(),
    }
  }

  async cancelReminderForToday(
    userId: string,
  ): Promise<{ ok: true; cancelledDate: string }> {
    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId)
    const timezone =
      settingsResult.isOk() && settingsResult.value?.timezone
        ? settingsResult.value.timezone
        : 'America/Sao_Paulo'
    const today = this.localDateService.today(timezone)

    await this.userSettingsRepository.updateCancelledDate(userId, today.iso)

    return {
      ok: true,
      cancelledDate: today.display,
    }
  }

  notifyReminder(discordUserId: string, nextRunAt: string): void {
    this.notifications.notifyStandupReminder({
      discordUserId,
      nextRunAt,
    })
  }
}
