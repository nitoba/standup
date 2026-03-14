import { Injectable } from '@nestjs/common'
import { type DbError, type NotFoundError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { EventBusService } from '../../events/event-bus.service'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-standup-notification',
})

export interface StandupReadyResult {
  standupId: string
  dmSent: boolean
  transitioned: boolean
}

@Injectable()
export class StandupNotificationService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly messages: DiscordMessagesService,
    private readonly eventBus: EventBusService,
  ) {}

  async notifyStandupReady(
    standupId: string,
    discordUserId: string,
  ): Promise<Result<StandupReadyResult, NotFoundError | DbError>> {
    const found = await this.standupRepository.findById(standupId)
    if (found.isErr()) {
      return found
    }

    const record = found.value
    const dmResult = await this.messages.sendReviewDm(record, discordUserId)

    if (dmResult.isErr()) {
      logger.warn('Failed to send review DM', {
        standupId,
        error: dmResult.error.message,
      })
      return Result.ok({ standupId, dmSent: false, transitioned: false })
    }

    const saveMessageIdResult = await this.standupRepository.updateDmMessageId(
      standupId,
      dmResult.value.messageId,
    )
    if (saveMessageIdResult.isErr()) {
      logger.warn('Failed to persist dmMessageId', {
        standupId,
        error: saveMessageIdResult.error.message,
      })
    }

    const transitionResult = await this.standupRepository.updateStatus(
      standupId,
      'pending_review',
    )
    if (transitionResult.isErr()) {
      logger.warn('Failed to transition standup to pending_review', {
        standupId,
        error: transitionResult.error.message,
      })
      return Result.ok({ standupId, dmSent: true, transitioned: false })
    }

    if (record.userId) {
      this.eventBus.emitStandupStatusChanged({
        userId: record.userId,
        standupId,
        newStatus: 'pending_review',
        source: 'worker',
      })
    }

    return Result.ok({ standupId, dmSent: true, transitioned: true })
  }
}
