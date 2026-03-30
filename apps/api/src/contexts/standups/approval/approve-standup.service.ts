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
  type StandupRecord,
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
  ): Promise<Result<StandupRecord, ApproveStandupError>> {
    // Pre-fetch to compute mergedContent before entering the transaction
    // (mergeCustomEntries is pure CPU — no I/O needed inside the tx).
    let mergedContent: string | null = null

    if (customEntries && hasCustomEntries(customEntries)) {
      const found = await this.standupRepository.findByIdForUser(
        standupId,
        userId,
      )
      if (found.isErr()) {
        return found
      }
      mergedContent = mergeCustomEntries(
        found.value.content,
        found.value.meetingType,
        customEntries,
      )
    }

    // Single atomic write: customEntries + content + status in one transaction (TAS-57)
    const approvedResult = await this.standupRepository.approveForUser(
      standupId,
      userId,
      mergedContent,
      customEntries && hasCustomEntries(customEntries) ? customEntries : null,
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
