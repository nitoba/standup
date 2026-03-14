import { Injectable } from '@nestjs/common'
import type { StandupStatus } from '@standup/domain'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { EventBusService } from '../../events/event-bus.service'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class StandupStatusService {
  constructor(
    private readonly standupRepository: StandupRepository,
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

    return result.value
  }
}
