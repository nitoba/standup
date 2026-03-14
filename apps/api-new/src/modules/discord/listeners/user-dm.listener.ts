import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import {
  USER_DM_REQUESTED_EVENT,
  type UserDmRequestedEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-user-dm-listener',
})

@Injectable()
export class UserDmListener {
  constructor(private readonly messages: DiscordMessagesService) {}

  @OnEvent(USER_DM_REQUESTED_EVENT)
  async handle(event: UserDmRequestedEvent): Promise<void> {
    const result = await this.messages.sendUserDm(event)

    if (result.isErr()) {
      logger.warn('Failed to send direct user DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
