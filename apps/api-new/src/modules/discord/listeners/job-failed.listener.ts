import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EnvService } from '../../../shared/env/env.service'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  JOB_FAILED_NOTIFICATION_EVENT,
  type JobFailedNotificationEvent,
} from '../../events/standup-events'
import { buildJobFailedEmbed } from '../embeds'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

@Injectable()
export class JobFailedListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-job-failed-listener')
  }

  @OnEvent(JOB_FAILED_NOTIFICATION_EVENT)
  async handle(event: JobFailedNotificationEvent): Promise<void> {
    if (!this.env.discord.channelId) {
      return
    }

    const result = await this.messages.sendChannelNotification(
      this.env.discord.channelId,
      buildJobFailedEmbed(event.error, event.context),
    )

    if (result.isErr()) {
      this.logger.warn('Failed to send job failed notification', {
        error: result.error.message,
      })
    }
  }
}
