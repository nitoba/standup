import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { DiscordMessagesService } from '../../../interfaces/discord/notifications/discord-messages.service'
import { AppLoggerFactory } from '../../../platform/logger'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '../../../shared/domain'

export type RetryDmError =
  | NotFoundError
  | DbError
  | ValidationError
  | InvalidStateTransitionError

@Injectable()
export class RetryDmService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRead: StandupReadRepository,
    private readonly standupWrite: StandupWriteRepository,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('retry-dm')
  }

  async retryDm(
    standupId: string,
    userId: string,
    discordUserId: string,
  ): Promise<
    Result<{ standupId: string; newStatus: 'pending_review' }, RetryDmError>
  > {
    const found = await this.standupRead.findById(standupId)
    if (found.isErr()) {
      return Result.err(found.error)
    }

    const record = found.value
    if (record.status !== 'delivery_pending') {
      return Result.err(
        new ValidationError({
          field: 'status',
          message: `Standup not in delivery_pending state, current: ${record.status}`,
        }),
      )
    }

    const dmResult = await this.messages.sendReviewDm(record, discordUserId)
    if (dmResult.isErr()) {
      return Result.err(
        new ValidationError({
          field: 'dm',
          message: `Failed to send review DM: ${dmResult.error.message}`,
        }),
      )
    }

    await this.standupWrite.updateDmMessageId(
      standupId,
      dmResult.value.messageId,
    )

    const updateResult = await this.standupWrite.updateStatus(
      standupId,
      'pending_review',
    )
    if (updateResult.isErr()) {
      return Result.err(updateResult.error)
    }

    this.logger.info('DM retried and standup transitioned to pending_review', {
      standupId,
    })

    return Result.ok({ standupId, newStatus: 'pending_review' })
  }
}
