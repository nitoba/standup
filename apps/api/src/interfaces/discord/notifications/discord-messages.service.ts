import { Injectable, OnModuleDestroy } from '@nestjs/common'
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
  STANDUP_PROGRESS_EVENT,
  STANDUP_REMINDER_EVENT,
  type StandupProgressEvent,
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

type PendingReminder = {
  discordUserId: string
  messageId: string
  /** Unix timestamp (ms) when this reminder was stored — used for TTL eviction */
  storedAt: number
}

/** Reminders older than this are considered stale and removed (TAS-68) */
const REMINDER_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours
/** How often the cleanup sweep runs */
const REMINDER_CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

@Injectable()
export class DiscordMessagesService implements OnModuleDestroy {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly pendingReminders = new Map<string, PendingReminder>()
  private cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly discordClient: DiscordClientService,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-messages')
    // Periodic cleanup of stale reminder entries to prevent memory leak (TAS-68)
    this.cleanupTimer = setInterval(
      () => this.evictStaleReminders(),
      REMINDER_CLEANUP_INTERVAL_MS,
    )
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer)
    }
  }

  /** Remove entries older than REMINDER_TTL_MS (TAS-68) */
  private evictStaleReminders(): void {
    const cutoff = Date.now() - REMINDER_TTL_MS
    for (const [userId, reminder] of this.pendingReminders) {
      if (reminder.storedAt < cutoff) {
        this.pendingReminders.delete(userId)
      }
    }
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
      return
    }

    this.pendingReminders.set(event.userId, {
      discordUserId: event.discordUserId,
      messageId: result.value.messageId,
      storedAt: Date.now(),
    })
  }

  @OnEvent(STANDUP_PROGRESS_EVENT)
  async handleStandupProgress(event: StandupProgressEvent): Promise<void> {
    if (event.step !== 'queued') return

    await this.dismissReminderDm(event.userId)
  }

  @OnEvent(JOB_FAILED_NOTIFICATION_EVENT)
  async handleJobFailedNotification(
    event: JobFailedNotificationEvent,
  ): Promise<void> {
    this.logger.debug('Job failed notification received', {
      error: event.error,
      context: event.context,
    })
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

  async sendPlaceholderDm(opts: {
    discordUserId: string
    content: string
  }): Promise<Result<{ messageId: string }, ExternalServiceError>> {
    return ResultFactory.tryPromise({
      try: async () => {
        const client = this.requireClient()
        const user = await client.users.fetch(opts.discordUserId)
        const message = await user.send({ content: opts.content })
        return { messageId: message.id }
      },
      catch: (error) =>
        new DiscordError({
          service: 'discord',
          message: `Failed to send placeholder DM: ${error instanceof Error ? error.message : String(error)}`,
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

  private async dismissReminderDm(userId: string): Promise<void> {
    const pending = this.pendingReminders.get(userId)
    if (!pending) return

    this.pendingReminders.delete(userId)

    const editResult = await this.updateDmMessage({
      discordUserId: pending.discordUserId,
      messageId: pending.messageId,
      payload: {
        content: '⏳ Standup em geração — lembrete encerrado.',
        embeds: [],
        components: [],
      },
    })

    if (editResult.isErr()) {
      this.logger.warn('Failed to dismiss reminder DM', {
        userId,
        messageId: pending.messageId,
        error: editResult.error.message,
      })
    }
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
