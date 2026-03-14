import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import {
  DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT,
  type DiscordLoginSuccessRequestedEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-login-success-listener',
})

@Injectable()
export class LoginSuccessListener {
  constructor(private readonly messages: DiscordMessagesService) {}

  @OnEvent(DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT)
  async handle(event: DiscordLoginSuccessRequestedEvent): Promise<void> {
    const result = await this.messages.sendLoginSuccessDm(event.discordUserId)

    if (result.isErr()) {
      logger.warn('Failed to send login success DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
