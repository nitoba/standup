import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  STANDUP_READY_EVENT,
  type StandupReadyEvent,
} from '../../events/standup-events'
import { StandupNotificationService } from '../services/standup-notification.service'

@Injectable()
export class StandupReadyListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupNotification: StandupNotificationService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-ready-listener')
  }

  @OnEvent(STANDUP_READY_EVENT)
  async handle(event: StandupReadyEvent): Promise<void> {
    const result = await this.standupNotification.notifyStandupReady(
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
}
