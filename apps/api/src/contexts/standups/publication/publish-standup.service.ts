import { Injectable } from '@nestjs/common'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import type { StandupStatusChangedEvent } from '../../../platform/events/standup-events'
import {
  type DbError,
  type InvalidStateTransitionError,
  type NotFoundError,
  Result,
} from '../../../shared/domain'

type PublishStandupError = NotFoundError | DbError | InvalidStateTransitionError

@Injectable()
export class PublishStandupService {
  constructor(
    private readonly standupRepository: StandupWriteRepository,
    private readonly eventBus: EventBusService,
  ) {}

  async publish(
    userId: string,
    standupId: string,
    source: StandupStatusChangedEvent['source'] = 'system',
  ): Promise<
    Result<
      Awaited<
        ReturnType<StandupWriteRepository['updateStatusForUser']>
      > extends Result<infer TValue, infer _TError>
        ? TValue
        : never,
      PublishStandupError
    >
  > {
    const result = await this.standupRepository.updateStatusForUser(
      standupId,
      userId,
      'published',
    )

    if (result.isErr()) {
      return result
    }

    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId: result.value.id,
      newStatus: 'published',
      source,
    })

    return Result.ok(result.value)
  }
}
