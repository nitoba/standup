import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT,
  type DiscordLoginSuccessRequestedEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

@Injectable()
export class LoginSuccessListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('discord-login-success-listener')
  }

  @OnEvent(DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT)
  async handle(event: DiscordLoginSuccessRequestedEvent): Promise<void> {
    const result = await this.messages.sendLoginSuccessDm(event.discordUserId)

    if (result.isErr()) {
      this.logger.warn('Failed to send login success DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
