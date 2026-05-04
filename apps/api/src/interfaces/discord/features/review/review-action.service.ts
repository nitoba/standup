import { Injectable } from '@nestjs/common'
import { ApproveStandupService } from '../../../../contexts/standups/approval/approve-standup.service'
import { StandupStatusService } from '../../../../contexts/standups/status/standup-status.service'
import { UserRepository } from '../../../../platform/database/repositories/user.repository'
import {
  type CustomEntries,
  type DbError,
  type InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '../../../../shared/domain'
import { DiscordMessagesService } from '../../notifications/discord-messages.service'

export const REVIEW_ACTIONS = ['approve', 'reject', 'regenerate'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

export interface ReviewActionOutcome {
  action: ReviewAction
  standupId: string
  userId: string
  newStatus: 'approved' | 'rejected'
  message: string
}

type ReviewActionError =
  | NotFoundError
  | InvalidStateTransitionError
  | DbError
  | ValidationError

@Injectable()
export class ReviewActionService {
  constructor(
    private readonly userRepository: UserRepository,
    readonly _messages: DiscordMessagesService,
    private readonly approveStandup: ApproveStandupService,
    private readonly standupStatus: StandupStatusService,
  ) {}

  async handle(
    action: ReviewAction,
    standupId: string,
    actorDiscordId: string,
    customEntries?: CustomEntries | null,
  ): Promise<Result<ReviewActionOutcome, ReviewActionError>> {
    const userRepository = this.userRepository
    const handleApprove = this.handleApprove.bind(this)
    const handleReject = this.handleReject.bind(this)
    const handleRegenerate = this.handleRegenerate.bind(this)

    if (
      action !== 'approve' &&
      action !== 'reject' &&
      action !== 'regenerate'
    ) {
      return Result.err(
        new ValidationError({
          field: 'action',
          message: `Unknown standup action: ${String(action)}`,
        }),
      )
    }

    return Result.gen(async function* () {
      const actor = yield* Result.await(
        userRepository.hasActiveSession(actorDiscordId),
      )

      if (!actor?.hasSession) {
        return Result.err(
          new ValidationError({
            field: 'actorDiscordId',
            message: 'Discord user does not have an active session',
          }),
        )
      }

      const actorUserId = actor.userId

      switch (action) {
        case 'approve': {
          const outcome = yield* Result.await(
            handleApprove(standupId, actorUserId, customEntries),
          )
          return Result.ok(outcome)
        }
        case 'reject': {
          const outcome = yield* Result.await(
            handleReject(standupId, actorUserId),
          )
          return Result.ok(outcome)
        }
        case 'regenerate': {
          const outcome = yield* Result.await(
            handleRegenerate(standupId, actorUserId),
          )
          return Result.ok(outcome)
        }
      }
    })
  }

  private async handleApprove(
    standupId: string,
    actorUserId: string,
    customEntries?: CustomEntries | null,
  ): Promise<Result<ReviewActionOutcome, ReviewActionError>> {
    const approveResult = await this.approveStandup.approveResult(
      actorUserId,
      standupId,
      customEntries,
      'discord',
    )
    if (approveResult.isErr()) {
      return Result.err(approveResult.error)
    }

    return Result.ok({
      action: 'approve',
      standupId,
      userId: actorUserId,
      newStatus: 'approved',
      message: 'Standup aprovado!',
    })
  }

  private async handleReject(
    standupId: string,
    actorUserId: string,
  ): Promise<Result<ReviewActionOutcome, ReviewActionError>> {
    const result = await this.standupStatus.transition(
      actorUserId,
      standupId,
      'rejected',
      'discord',
    )
    if (result.isErr()) {
      return Result.err(result.error)
    }

    return Result.ok({
      action: 'reject',
      standupId,
      userId: actorUserId,
      newStatus: 'rejected',
      message:
        'Standup rejeitado. Gere uma nova versão ou aguarde o próximo cron.',
    })
  }

  private async handleRegenerate(
    standupId: string,
    actorUserId: string,
  ): Promise<Result<ReviewActionOutcome, ReviewActionError>> {
    const result = await this.standupStatus.transition(
      actorUserId,
      standupId,
      'rejected',
      'discord',
    )
    if (result.isErr()) {
      return Result.err(result.error)
    }

    return Result.ok({
      action: 'regenerate',
      standupId,
      userId: actorUserId,
      newStatus: 'rejected',
      message: 'Standup rejeitado para regeneração.',
    })
  }
}
