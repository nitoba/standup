import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
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
import { UserTimezoneService } from '../shared/user-timezone.service'

type ApproveStandupError = NotFoundError | DbError | InvalidStateTransitionError

@Injectable()
export class ApproveStandupService {
  constructor(
    private readonly standupRead: StandupReadRepository,
    private readonly standupWrite: StandupWriteRepository,
    private readonly localDateService: LocalDateService,
    private readonly eventBus: EventBusService,
    private readonly userTimezone: UserTimezoneService,
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
      throw approvedResult.error
    }

    return formatStandupRecord(
      approvedResult.value,
      this.localDateService,
      await this.userTimezone.resolve(userId),
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
      const found = await this.standupRead.findByIdForUser(standupId, userId)
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
    const approvedResult = await this.standupWrite.approveForUser(
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
}
