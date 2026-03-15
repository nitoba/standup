import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { APIEmbed } from 'discord.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type MessageEditOptions,
} from 'discord.js'
import { EnvService } from '../../../platform/env/env.service'
import {
  DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT,
  type DiscordLoginSuccessRequestedEvent,
  JOB_FAILED_NOTIFICATION_EVENT,
  type JobFailedNotificationEvent,
  STANDUP_REMINDER_EVENT,
  type StandupReminderEvent,
  USER_DM_REQUESTED_EVENT,
  type UserDmRequestedEvent,
} from '../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../platform/logger'
import type {
  ExternalServiceError,
  Result,
  StandupRecord,
} from '../../../shared/domain'
import {
  ExternalServiceError as DiscordError,
  Result as ResultFactory,
} from '../../../shared/domain'
import { DiscordClientService } from '../discord-client.service'
import {
  buildJobFailedEmbed,
  buildPublishedEmbed,
  buildReminderEmbed,
  buildReviewEmbed,
  buildUserDmEmbed,
  EMBED_COLORS,
} from '../embeds'

@Injectable()
export class DiscordMessagesService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly discordClient: DiscordClientService,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-messages')
  }

  @OnEvent(USER_DM_REQUESTED_EVENT)
  async handleUserDmRequested(event: UserDmRequestedEvent): Promise<void> {
    const result = await this.sendUserDm(event)

    if (result.isErr()) {
      this.logger.warn('Failed to send direct user DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }

  @OnEvent(DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT)
  async handleLoginSuccessRequested(
    event: DiscordLoginSuccessRequestedEvent,
  ): Promise<void> {
    const result = await this.sendLoginSuccessDm(event.discordUserId)

    if (result.isErr()) {
      this.logger.warn('Failed to send login success DM', {
        discordUserId: event.discordUserId,
        error: result.error.message,
      })
    }
  }

  @OnEvent(STANDUP_REMINDER_EVENT)
  async handleStandupReminder(event: StandupReminderEvent): Promise<void> {
    const result = await this.sendReminderDm(
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

  @OnEvent(JOB_FAILED_NOTIFICATION_EVENT)
  async handleJobFailedNotification(
    event: JobFailedNotificationEvent,
  ): Promise<void> {
    if (!this.env.discord.channelId) {
      return
    }

    const result = await this.sendChannelNotification(
      this.env.discord.channelId,
      buildJobFailedEmbed(event.error, event.context),
    )

    if (result.isErr()) {
      this.logger.warn('Failed to send job failed notification', {
        error: result.error.message,
      })
    }
  }

  async sendReviewDm(
    record: StandupRecord,
    discordUserId: string,
  ): Promise<Result<{ messageId: string }, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(discordUserId)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`standup:approve:${record.id}`)
            .setLabel('Aprovar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`standup:reject:${record.id}`)
            .setLabel('Rejeitar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`standup:adjust:${record.id}`)
            .setLabel('Ajustar texto')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`standup:regenerate:${record.id}`)
            .setLabel('Regenerar do zero')
            .setStyle(ButtonStyle.Secondary),
        )

        const message = await user.send({
          embeds: [buildReviewEmbed(record)],
          components: [row],
        })

        this.logger.info('Review DM sent', {
          standupId: record.id,
          userId: discordUserId,
          messageId: message.id,
        })

        return { messageId: message.id }
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send review DM: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async sendReminderDm(
    nextRunAt: string,
    discordUserId: string,
  ): Promise<Result<{ messageId: string }, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(discordUserId)
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('standup-reminder:run-now')
            .setLabel('Executar Agora')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('standup-reminder:snooze')
            .setLabel('Adiar 15min')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('standup-reminder:cancel-today')
            .setLabel('Cancelar Hoje')
            .setStyle(ButtonStyle.Danger),
        )

        const message = await user.send({
          embeds: [buildReminderEmbed(nextRunAt)],
          components: [row],
        })

        this.logger.info('Reminder DM sent', {
          userId: discordUserId,
          messageId: message.id,
          nextRunAt,
        })

        return { messageId: message.id }
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send reminder DM: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async sendUserDm(opts: {
    discordUserId: string
    title: string
    message: string
    color?: number
  }): Promise<Result<void, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(opts.discordUserId)
        const embed = buildUserDmEmbed(
          opts.title,
          opts.message,
          opts.color ?? EMBED_COLORS.REVIEW,
        )

        await user.send({ embeds: [embed] })
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send user DM: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async sendLoginSuccessDm(
    discordUserId: string,
  ): Promise<Result<{ messageId: string }, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(discordUserId)
        const message = await user.send({
          content:
            'Login concluído com sucesso! Agora você pode usar todos os comandos do Standup Bot.',
        })

        return { messageId: message.id }
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send login success DM: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async sendChannelNotification(
    channelId: string,
    embed: APIEmbed,
    components?: ActionRowBuilder<ButtonBuilder>[],
  ): Promise<Result<void, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const channel = await client.channels.fetch(channelId)

        if (!channel) {
          throw new Error(`Channel not found: ${channelId}`)
        }

        if (!channel.isTextBased() || !channel.isSendable()) {
          throw new Error(`Channel ${channelId} is not sendable`)
        }

        await channel.send({
          embeds: [embed],
          components: components ?? [],
        })
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send channel notification: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async publishStandup(
    record: StandupRecord,
    channelId: string,
  ): Promise<Result<void, ExternalServiceError>> {
    const copyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`standup-copy:content:${record.id}`)
        .setLabel('Copiar texto')
        .setStyle(ButtonStyle.Secondary),
    )

    return this.sendChannelNotification(
      channelId,
      buildPublishedEmbed(record),
      [copyRow],
    )
  }

  async updateDmMessage(opts: {
    discordUserId: string
    messageId: string
    payload: MessageEditOptions
  }): Promise<Result<void, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(opts.discordUserId)
        const dmChannel = await user.createDM()
        const message = await dmChannel.messages.fetch(opts.messageId)
        await message.edit(opts.payload)
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to update DM message: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  isReady(): boolean {
    return this.discordClient.isReady
  }

  private requireClient(): Client {
    const client = this.discordClient.currentClient
    if (!client) {
      throw new Error('Discord gateway is not connected')
    }

    return client
  }
}
