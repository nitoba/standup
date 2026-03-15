import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import type { StandupStatusChangedEvent } from '../../../platform/events/standup-events'
import { LocalDateService } from '../../../platform/time/local-date.service'
import {
  type DbError,
  type InvalidStateTransitionError,
  type NotFoundError,
  Result,
  type StandupStatus,
} from '../../../shared/domain'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

type StandupStatusTransitionError =
  | NotFoundError
  | DbError
  | InvalidStateTransitionError

@Injectable()
export class StandupStatusService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly localDateService: LocalDateService,
    private readonly eventBus: EventBusService,
  ) {}

  async update(
    userId: string,
    standupId: string,
    status: StandupStatus,
    source: StandupStatusChangedEvent['source'] = 'web',
  ) {
    const result = await this.transition(userId, standupId, status, source)

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    return formatStandupRecord(
      result.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  async transition(
    userId: string,
    standupId: string,
    status: StandupStatus,
    source: StandupStatusChangedEvent['source'] = 'web',
  ): Promise<
    Result<
      Awaited<
        ReturnType<StandupRepository['updateStatusForUser']>
      > extends Result<infer TValue, infer _TError>
        ? TValue
        : never,
      StandupStatusTransitionError
    >
  > {
    const result = await this.standupRepository.updateStatusForUser(
      standupId,
      userId,
      status,
    )

    if (result.isErr()) {
      return result
    }

    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId: result.value.id,
      newStatus: result.value.status,
      source,
    })

    return Result.ok(result.value)
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
