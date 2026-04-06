import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import {
  STANDUP_READY_EVENT,
  type StandupReadyEvent,
} from '../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../platform/logger'
import {
  type DbError,
  type NotFoundError,
  Result,
} from '../../../shared/domain'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export interface StandupReadyResult {
  standupId: string
  dmSent: boolean
  transitioned: boolean
  newStatus?: 'pending_review' | 'delivery_pending'
}

@Injectable()
export class StandupNotificationService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRead: StandupReadRepository,
    private readonly standupWrite: StandupWriteRepository,
    private readonly messages: DiscordMessagesService,
    private readonly eventBus: EventBusService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-notification')
  }

  @OnEvent(STANDUP_READY_EVENT)
  async handleStandupReady(event: StandupReadyEvent): Promise<void> {
    const result = await this.notifyStandupReady(
      event.standupId,
      event.discordUserId,
    )

    if (result.isErr()) {
      this.logger.warn('Failed to process standup ready event', {
        standupId: event.standupId,
        error: result.error.message,
      })
    }
  }

  async notifyStandupReady(
    standupId: string,
    discordUserId: string,
  ): Promise<Result<StandupReadyResult, NotFoundError | DbError>> {
    const found = await this.standupRead.findById(standupId)
    if (found.isErr()) {
      return found
    }

    const record = found.value
    const dmResult = await this.messages.sendReviewDm(record, discordUserId)

    if (dmResult.isErr()) {
      this.logger.warn('Failed to send review DM', {
        standupId,
        error: dmResult.error.message,
      })

      const transitionResult = await this.standupWrite.updateStatus(
        standupId,
        'delivery_pending',
      )
      if (transitionResult.isErr()) {
        this.logger.warn('Failed to transition standup to delivery_pending', {
          standupId,
          error: transitionResult.error.message,
        })
        return Result.ok({ standupId, dmSent: false, transitioned: false })
      }

      return Result.ok({
        standupId,
        dmSent: false,
        transitioned: true,
        newStatus: 'delivery_pending',
      })
    }

    const saveMessageIdResult = await this.standupWrite.updateDmMessageId(
      standupId,
      dmResult.value.messageId,
    )
    if (saveMessageIdResult.isErr()) {
      this.logger.warn('Failed to persist dmMessageId', {
        standupId,
        error: saveMessageIdResult.error.message,
      })
    }

    const transitionResult = await this.standupWrite.updateStatus(
      standupId,
      'pending_review',
    )
    if (transitionResult.isErr()) {
      this.logger.warn('Failed to transition standup to pending_review', {
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

    return Result.ok({
      standupId,
      dmSent: true,
      transitioned: true,
      newStatus: 'pending_review',
    })
  }
}
