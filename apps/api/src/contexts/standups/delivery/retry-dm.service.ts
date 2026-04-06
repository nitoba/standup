import { Injectable } from '@nestjs/common'
import { DiscordMessagesService } from '../../../interfaces/discord/notifications/discord-messages.service'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { AppLoggerFactory } from '../../../platform/logger'
import {
  DbError,
  ExternalServiceError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '../../../shared/domain'

export type RetryDmError =
  | NotFoundError
  | DbError
  | ExternalServiceError
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
    _userId: string,
    discordUserId: string,
  ): Promise<
    Result<{ standupId: string; newStatus: 'pending_review' }, RetryDmError>
  > {
    const standupRead = this.standupRead
    const standupWrite = this.standupWrite
    const messages = this.messages
    const logger = this.logger

    return Result.gen(async function* () {
      const record = yield* Result.await(standupRead.findById(standupId))

      if (record.status !== 'delivery_pending') {
        return Result.err(
          new ValidationError({
            field: 'status',
            message: `Standup not in delivery_pending state, current: ${record.status}`,
          }),
        )
      }

      const dm = yield* Result.await(
        messages.sendReviewDm(record, discordUserId),
      )

      yield* Result.await(
        standupWrite.updateDmMessageId(standupId, dm.messageId),
      )

      const updated = yield* Result.await(
        standupWrite.updateStatus(standupId, 'pending_review'),
      )

      logger.info('DM retried and standup transitioned to pending_review', {
        standupId,
      })

      return Result.ok({
        standupId: updated.id,
        newStatus: 'pending_review' as const,
      })
    })
  }
}
