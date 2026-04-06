import { Injectable } from '@nestjs/common'
import { ApproveStandupService } from '../../../contexts/standups/approval/approve-standup.service'
import { StandupStatusService } from '../../../contexts/standups/status/standup-status.service'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import {
  type CustomEntries,
  type DbError,
  type InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '../../../shared/domain'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export const STANDUP_ACTIONS = ['approve', 'reject', 'regenerate'] as const
export type StandupAction = (typeof STANDUP_ACTIONS)[number]

export interface InteractionOutcome {
  action: StandupAction
  standupId: string
  userId: string
  newStatus: 'approved' | 'rejected' | 'published'
  message: string
}

type InteractionError =
  | NotFoundError
  | InvalidStateTransitionError
  | DbError
  | ValidationError

@Injectable()
export class StandupInteractionService {
  constructor(
    private readonly userRepository: UserRepository,
    readonly _messages: DiscordMessagesService,
    private readonly approveStandup: ApproveStandupService,
    private readonly standupStatus: StandupStatusService,
  ) {}

  async handle(
    action: StandupAction,
    standupId: string,
    actorDiscordId: string,
    customEntries?: CustomEntries | null,
  ): Promise<Result<InteractionOutcome, InteractionError>> {
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

    const actorResult =
      await this.userRepository.hasActiveSession(actorDiscordId)
    if (
      actorResult.isErr() ||
      !actorResult.value ||
      !actorResult.value.hasSession
    ) {
      return Result.err(
        new NotFoundError({ resource: 'standup', id: standupId }),
      )
    }

    const actorUserId = actorResult.value.userId

    switch (action) {
      case 'approve':
        return this.handleApprove(standupId, actorUserId, customEntries)
      case 'reject':
        return this.handleReject(standupId, actorUserId)
      case 'regenerate':
        return this.handleRegenerate(standupId, actorUserId)
    }
  }

  private async handleApprove(
    standupId: string,
    actorUserId: string,
    customEntries?: CustomEntries | null,
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const approveResult = await this.approveStandup.approveResult(
      actorUserId,
      standupId,
      customEntries,
      'discord',
    )
    if (approveResult.isErr()) {
      return approveResult
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
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const result = await this.standupStatus.transition(
      actorUserId,
      standupId,
      'rejected',
      'discord',
    )
    if (result.isErr()) {
      return result
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
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const result = await this.standupStatus.transition(
      actorUserId,
      standupId,
      'rejected',
      'discord',
    )
    if (result.isErr()) {
      return result
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
