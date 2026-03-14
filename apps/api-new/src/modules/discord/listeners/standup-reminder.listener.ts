import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import {
  STANDUP_REMINDER_EVENT,
  type StandupReminderEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-standup-reminder-listener',
})

@Injectable()
export class StandupReminderListener {
  constructor(private readonly messages: DiscordMessagesService) {}

  @OnEvent(STANDUP_REMINDER_EVENT)
  async handle(event: StandupReminderEvent): Promise<void> {
    const result = await this.messages.sendReminderDm(
      event.nextRunAt,
      event.discordUserId,
    )

    if (result.isErr()) {
      logger.warn('Failed to send reminder DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
