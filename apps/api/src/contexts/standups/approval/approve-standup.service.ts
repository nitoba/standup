import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import type { StandupStatusChangedEvent } from '../../../platform/events/standup-events'
import { LocalDateService } from '../../../platform/time/local-date.service'
import {
  type CustomEntries,
  type DbError,
  hasCustomEntries,
  type InvalidStateTransitionError,
  mergeCustomEntries,
  type NotFoundError,
  Result,
} from '../../../shared/domain'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

type ApproveStandupError = NotFoundError | DbError | InvalidStateTransitionError

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
    source: StandupStatusChangedEvent['source'] = 'web',
  ) {
    const approvedResult = await this.approveResult(
      userId,
      standupId,
      customEntries,
      source,
    )

    if (approvedResult.isErr()) {
      throwStandupHttpError(approvedResult.error)
    }

    return formatStandupRecord(
      approvedResult.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  async approveResult(
    userId: string,
    standupId: string,
    customEntries?: CustomEntries | null,
    source: StandupStatusChangedEvent['source'] = 'web',
  ): Promise<
    Result<
      Awaited<
        ReturnType<StandupRepository['updateStatusForUser']>
      > extends Result<infer TValue, infer _TError>
        ? TValue
        : never,
      ApproveStandupError
    >
  > {
    const found = await this.standupRepository.findByIdForUser(
      standupId,
      userId,
    )

    if (found.isErr()) {
      return found
    }

    if (customEntries && hasCustomEntries(customEntries)) {
      const saveEntriesResult =
        await this.standupRepository.updateCustomEntriesForUser(
          standupId,
          userId,
          customEntries,
        )

      if (saveEntriesResult.isErr()) {
        return saveEntriesResult
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
        return saveContentResult
      }
    }

    const approvedResult = await this.standupRepository.updateStatusForUser(
      standupId,
      userId,
      'approved',
    )

    if (approvedResult.isErr()) {
      return approvedResult
    }

    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId: approvedResult.value.id,
      newStatus: 'approved',
      source,
    })

    return Result.ok(approvedResult.value)
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
