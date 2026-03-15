import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import type { StandupStatus } from '../../../shared/domain'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class StandupStatusService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly localDateService: LocalDateService,
    private readonly eventBus: EventBusService,
  ) {}

  async update(userId: string, standupId: string, status: StandupStatus) {
    const result = await this.standupRepository.updateStatusForUser(
      standupId,
      userId,
      status,
    )

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId: result.value.id,
      newStatus: result.value.status,
      source: 'web',
    })

    return formatStandupRecord(
      result.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId)

    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }

    return 'America/Sao_Paulo'
  }
}
