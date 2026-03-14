import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  USER_DM_REQUESTED_EVENT,
  type UserDmRequestedEvent,
} from '../../events/standup-events'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

@Injectable()
export class UserDmListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('discord-user-dm-listener')
  }

  @OnEvent(USER_DM_REQUESTED_EVENT)
  async handle(event: UserDmRequestedEvent): Promise<void> {
    const result = await this.messages.sendUserDm(event)

    if (result.isErr()) {
      this.logger.warn('Failed to send direct user DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }
}
