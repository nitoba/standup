import { Injectable } from '@nestjs/common'
import {
  type DbError,
  ExternalServiceError,
  type NotFoundError,
  Result,
} from '@standup/domain'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import { EnvService } from '../../../shared/env/env.service'
import { AppLoggerFactory } from '../../../shared/logger'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export interface SyncStandupStatusInput {
  standupId: string
  newStatus: 'approved' | 'rejected' | 'published'
}

type SyncError = NotFoundError | DbError | ExternalServiceError

@Injectable()
export class StandupStatusSyncService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupRepository,
    private readonly userRepository: UserRepository,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-status-sync')
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
          ? '❌ Rejeitado via web'
          : '✅ Aprovado e publicado via web'

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

    if (input.newStatus === 'approved' && this.env.discord.channelId) {
      const publishResult = await this.messages.publishStandup(
        record,
        this.env.discord.channelId,
      )

      if (publishResult.isErr()) {
        this.logger.warn('Failed to publish standup during sync', {
          standupId: input.standupId,
          error: publishResult.error.message,
        })
        return Result.ok(undefined)
      }

      const publishedResult = await this.standupRepository.updateStatus(
        input.standupId,
        'published',
      )

      if (publishedResult.isErr()) {
        this.logger.warn(
          'Failed to transition standup to published after sync',
          {
            standupId: input.standupId,
            error: publishedResult.error.message,
          },
        )
      }
    }

    return Result.ok(undefined)
  }
}
