import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  STANDUP_REMINDER_EVENT,
  type StandupReminderEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

@Injectable()
export class StandupReminderListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-reminder-listener')
  }

  @OnEvent(STANDUP_REMINDER_EVENT)
  async handle(event: StandupReminderEvent): Promise<void> {
    const result = await this.messages.sendReminderDm(
      event.nextRunAt,
      event.discordUserId,
    )

    if (result.isErr()) {
      this.logger.warn('Failed to send reminder DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
