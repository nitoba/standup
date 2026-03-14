import { Injectable } from '@nestjs/common'
import {
  type CustomEntries,
  hasCustomEntries,
  mergeCustomEntries,
} from '@standup/domain'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { EventBusService } from '../../events/event-bus.service'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class ApproveStandupService {
  constructor(
    private readonly standupRepository: StandupRepository,
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

    return approvedResult.value
  }
}
