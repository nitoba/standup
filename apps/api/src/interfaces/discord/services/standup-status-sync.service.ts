import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import {
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupStatusChangedEvent,
} from '../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../platform/logger'
import {
  type DbError,
  ExternalServiceError,
  type NotFoundError,
  Result,
} from '../../../shared/domain'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export interface SyncStandupStatusInput {
  standupId: string
  newStatus: 'approved' | 'rejected'
  source?: StandupStatusChangedEvent['source']
}

type SyncError = NotFoundError | DbError | ExternalServiceError

@Injectable()
export class StandupStatusSyncService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupReadRepository,
    private readonly userRepository: UserRepository,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-status-sync')
  }

  @OnEvent(STANDUP_STATUS_CHANGED_EVENT)
  async handleStatusChanged(event: StandupStatusChangedEvent): Promise<void> {
    if (event.source === 'discord') {
      return
    }

    if (event.newStatus !== 'approved' && event.newStatus !== 'rejected') {
      return
    }

    const result = await this.syncStatus({
      standupId: event.standupId,
      newStatus: event.newStatus,
      source: event.source,
    })

    if (result.isErr()) {
      this.logger.warn('Failed to sync standup status to Discord', {
        standupId: event.standupId,
        newStatus: event.newStatus,
        error: result.error.message,
      })
    }
  }

  async syncStatus(
    input: SyncStandupStatusInput,
  ): Promise<Result<void, SyncError>> {
    const found = await this.standupRepository.findById(input.standupId)
    if (found.isErr()) {
      return found
    }

    const record = found.value
    let discordUserId: string | undefined

    if (record.userId) {
      const accountResult = await this.userRepository.findDiscordIdByUserId(
        record.userId,
      )

      if (accountResult.isOk() && accountResult.value) {
        discordUserId = accountResult.value
      }
    }

    if (record.dmMessageId && discordUserId) {
      const label =
        input.newStatus === 'rejected'
          ? input.source === 'web'
            ? '❌ Rejeitado via web'
            : '❌ Rejeitado'
          : input.source === 'web'
            ? '✅ Aprovado via web'
            : '✅ Standup aprovado'

      const dmResult = await this.messages.updateDmMessage({
        discordUserId,
        messageId: record.dmMessageId,
        payload: {
          content: label,
          components: [],
        },
      })

      if (dmResult.isErr()) {
        this.logger.warn('Failed to sync DM message', {
          standupId: input.standupId,
          error: dmResult.error.message,
        })
      }
    }

    return Result.ok(undefined)
  }
}
