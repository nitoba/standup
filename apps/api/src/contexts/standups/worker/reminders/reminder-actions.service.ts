import { Injectable } from '@nestjs/common'
import { UserSettingsRepository } from '../../../../platform/database/repositories/user-settings.repository'
import { LocalDateService } from '../../../../platform/time/local-date.service'
import { WorkerEventPublisherService } from '../worker-event-publisher.service'

@Injectable()
export class ReminderActionsService {
  constructor(
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly notifications: WorkerEventPublisherService,
    private readonly localDateService: LocalDateService,
  ) {}

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
