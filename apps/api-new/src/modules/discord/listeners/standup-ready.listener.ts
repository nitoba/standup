import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import {
  STANDUP_READY_EVENT,
  type StandupReadyEvent,
} from '../../events/standup-events'
import { StandupNotificationService } from '../services/standup-notification.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-standup-ready-listener',
})

@Injectable()
export class StandupReadyListener {
  constructor(
    private readonly standupNotification: StandupNotificationService,
  ) {}

  @OnEvent(STANDUP_READY_EVENT)
  async handle(event: StandupReadyEvent): Promise<void> {
    const result = await this.standupNotification.notifyStandupReady(
      event.standupId,
      event.discordUserId,
    )

    if (result.isErr()) {
      logger.warn('Failed to process standup ready event', {
        standupId: event.standupId,
        error: result.error.message,
      })
    }
  }
}
