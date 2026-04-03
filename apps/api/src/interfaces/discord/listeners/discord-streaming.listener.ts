import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import {
  STANDUP_FAILED_EVENT,
  STANDUP_PROGRESS_EVENT,
  type StandupFailedEvent,
  type StandupProgressEvent,
} from '../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../platform/logger'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

interface ActiveStream {
  discordUserId: string
  messageId: string | null
  pendingContent: string
  lastEditAt: number
  batchTimer: ReturnType<typeof setTimeout> | null
}

const BATCH_INTERVAL_MS = 2_000

@Injectable()
export class DiscordStreamingListener implements OnModuleDestroy {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly activeStreams = new Map<string, ActiveStream>()

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
    private readonly userRepository: UserRepository,
  ) {
    this.logger = this.loggerFactory.create('discord-streaming')
  }

  onModuleDestroy(): void {
    for (const [, stream] of this.activeStreams) {
      if (stream.batchTimer) clearTimeout(stream.batchTimer)
    }
    this.activeStreams.clear()
  }

  @OnEvent(STANDUP_PROGRESS_EVENT)
  async handleProgress(event: StandupProgressEvent): Promise<void> {
    if (event.step === 'queued') {
      await this.handleQueued(event)
      return
    }

    if (event.step === 'streaming_content' && event.partialContent) {
      this.handleStreamingContent(event.runId, event.partialContent)
      return
    }

    if (event.step === 'completed' || event.step === 'no_activity') {
      await this.handleCompleted(event.runId, event.step)
    }
  }

  @OnEvent(STANDUP_FAILED_EVENT)
  async handleFailed(event: StandupFailedEvent): Promise<void> {
    const stream = this.activeStreams.get(event.runId)
    if (!stream) return

    this.cleanupStream(event.runId)

    if (stream.messageId) {
      await this.messages.updateDmMessage({
        discordUserId: stream.discordUserId,
        messageId: stream.messageId,
        payload: {
          content: `❌ Falha na geração: ${event.message}`,
          embeds: [],
        },
      })
    }
  }

  private async handleQueued(event: StandupProgressEvent): Promise<void> {
    const discordIdResult = await this.userRepository.findDiscordIdByUserId(
      event.userId,
    )

    if (discordIdResult.isErr()) {
      this.logger.warn('Failed to resolve discordUserId', {
        userId: event.userId,
        error: discordIdResult.error.message,
      })
      return
    }

    const discordUserId = discordIdResult.value
    if (!discordUserId) {
      this.logger.warn('No Discord account linked for user', {
        userId: event.userId,
      })
      return
    }

    const sendResult = await this.messages.sendPlaceholderDm({
      discordUserId,
      content: '⏳ **Gerando standup...**',
    })

    if (sendResult.isErr()) {
      this.logger.warn('Failed to send placeholder DM', {
        userId: event.userId,
        discordUserId,
        error: sendResult.error.message,
      })
      return
    }

    this.activeStreams.set(event.runId, {
      discordUserId,
      messageId: sendResult.value.messageId,
      pendingContent: '',
      lastEditAt: 0,
      batchTimer: null,
    })

    this.logger.info('Streaming started', {
      runId: event.runId,
      discordUserId,
      messageId: sendResult.value.messageId,
    })
  }

  private handleStreamingContent(runId: string, partialContent: string): void {
    const stream = this.activeStreams.get(runId)
    if (!stream || !stream.messageId) return

    stream.pendingContent = partialContent

    if (!stream.batchTimer) {
      stream.batchTimer = setTimeout(
        () => void this.flushStreamEdit(runId),
        BATCH_INTERVAL_MS,
      )
    }
  }

  private async flushStreamEdit(runId: string): Promise<void> {
    const stream = this.activeStreams.get(runId)
    if (!stream || !stream.messageId || !stream.pendingContent) return

    stream.batchTimer = null
    stream.lastEditAt = Date.now()

    const truncated = stream.pendingContent.slice(0, 4000)

    await this.messages.updateDmMessage({
      discordUserId: stream.discordUserId,
      messageId: stream.messageId,
      payload: {
        content: `⏳ **Gerando standup...**\n\n${truncated}\n\n_${stream.pendingContent.length} caracteres..._`,
        embeds: [],
      },
    })
  }

  private async handleCompleted(
    runId: string,
    step: 'completed' | 'no_activity',
  ): Promise<void> {
    const stream = this.activeStreams.get(runId)
    if (!stream) return

    this.cleanupStream(runId)

    if (!stream.messageId) return

    const content =
      step === 'completed'
        ? '✅ Standup gerado! Confira a mensagem abaixo para revisar.'
        : '🔍 Nenhuma atividade encontrada hoje.'

    await this.messages.updateDmMessage({
      discordUserId: stream.discordUserId,
      messageId: stream.messageId,
      payload: { content, embeds: [] },
    })
  }

  private cleanupStream(runId: string): void {
    const stream = this.activeStreams.get(runId)
    if (stream?.batchTimer) clearTimeout(stream.batchTimer)
    this.activeStreams.delete(runId)
  }
}
