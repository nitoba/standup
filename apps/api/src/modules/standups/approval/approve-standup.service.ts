import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../shared/database/repositories/user-settings.repository'
import {
  type CustomEntries,
  hasCustomEntries,
  mergeCustomEntries,
} from '../../../shared/domain'
import { LocalDateService } from '../../../shared/time/local-date.service'
import { EventBusService } from '../../events/event-bus.service'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class ApproveStandupService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly localDateService: LocalDateService,
    private readonly eventBus: EventBusService,
  ) {}

  async approve(
    userId: string,
    standupId: string,
    customEntries?: CustomEntries | null,
  ) {
    const found = await this.standupRepository.findByIdForUser(
      standupId,
      userId,
    )

    if (found.isErr()) {
      throwStandupHttpError(found.error)
    }

    if (customEntries && hasCustomEntries(customEntries)) {
      const saveEntriesResult =
        await this.standupRepository.updateCustomEntriesForUser(
          standupId,
          userId,
          customEntries,
        )

      if (saveEntriesResult.isErr()) {
        throwStandupHttpError(saveEntriesResult.error)
      }

      const mergedContent = mergeCustomEntries(
        saveEntriesResult.value.content,
        saveEntriesResult.value.meetingType,
        customEntries,
      )

      const saveContentResult =
        await this.standupRepository.updateContentForUser(
          standupId,
          userId,
          mergedContent,
        )

      if (saveContentResult.isErr()) {
        throwStandupHttpError(saveContentResult.error)
      }
    }

    const approvedResult = await this.standupRepository.updateStatusForUser(
      standupId,
      userId,
      'approved',
    )

    if (approvedResult.isErr()) {
      throwStandupHttpError(approvedResult.error)
    }

    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId: approvedResult.value.id,
      newStatus: 'approved',
      source: 'web',
    })

    return formatStandupRecord(
      approvedResult.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settingsResult = await this.userSettingsRepository.findByUserId(userId)

    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }

    return 'America/Sao_Paulo'
  }
}
