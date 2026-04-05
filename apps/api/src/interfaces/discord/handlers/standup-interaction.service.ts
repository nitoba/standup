import { Injectable } from '@nestjs/common'
import { ApproveStandupService } from '../../../contexts/standups/approval/approve-standup.service'
import { PublishStandupService } from '../../../contexts/standups/publication/publish-standup.service'
import { StandupStatusService } from '../../../contexts/standups/status/standup-status.service'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { EnvService } from '../../../platform/env/env.service'
import { AppLoggerFactory } from '../../../platform/logger'
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
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupReadRepository,
    private readonly userRepository: UserRepository,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
    private readonly approveStandup: ApproveStandupService,
    private readonly publishStandup: PublishStandupService,
    private readonly standupStatus: StandupStatusService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-interaction')
  }

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

    if (!this.env.discord.channelId) {
      return Result.ok({
        action: 'approve',
        standupId,
        userId: actorUserId,
        newStatus: 'approved',
        message: 'Standup aprovado!',
      })
    }

    const found = await this.standupRepository.findByIdForUser(
      standupId,
      actorUserId,
    )
    if (found.isErr()) {
      return found
    }

    const publishResult = await this.messages.publishStandup(
      found.value,
      this.env.discord.channelId,
    )
    if (publishResult.isErr()) {
      this.logger.warn('Failed to publish standup after approval', {
        standupId,
        error: publishResult.error.message,
      })
      return Result.ok({
        action: 'approve',
        standupId,
        userId: actorUserId,
        newStatus: 'approved',
        message:
          'Standup aprovado! A publicação falhou e pode ser feita manualmente.',
      })
    }

    const publishedResult = await this.publishStandup.publish(
      actorUserId,
      standupId,
      'discord',
    )
    if (publishedResult.isErr()) {
      this.logger.warn('Failed to mark standup as published', {
        standupId,
        error: publishedResult.error.message,
      })
      return Result.ok({
        action: 'approve',
        standupId,
        userId: actorUserId,
        newStatus: 'approved',
        message: 'Standup aprovado e publicado no canal!',
      })
    }

    return Result.ok({
      action: 'approve',
      standupId,
      userId: actorUserId,
      newStatus: 'published',
      message: 'Standup aprovado e publicado no canal!',
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
