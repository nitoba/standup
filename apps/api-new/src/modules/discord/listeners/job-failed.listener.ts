import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import { EnvService } from '../../../shared/env/env.service'
import {
  JOB_FAILED_NOTIFICATION_EVENT,
  type JobFailedNotificationEvent,
} from '../../events/standup-events'
import { buildJobFailedEmbed } from '../embeds'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-job-failed-listener',
})

@Injectable()
export class JobFailedListener {
  constructor(
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
  ) {}

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
      logger.warn('Failed to send job failed notification', {
        error: result.error.message,
      })
    }
  }
}
