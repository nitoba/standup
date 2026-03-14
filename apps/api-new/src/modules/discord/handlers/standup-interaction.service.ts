import { Injectable } from '@nestjs/common'
import type { StandupRecord } from '@standup/domain'
import {
  type DbError,
  type InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '@standup/domain'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import { EnvService } from '../../../shared/env/env.service'
import { AppLoggerFactory } from '../../../shared/logger'
import { EventBusService } from '../../events/event-bus.service'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export type StandupAction = 'approve' | 'reject' | 'regenerate'

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
    private readonly standupRepository: StandupRepository,
    private readonly userRepository: UserRepository,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
    private readonly eventBus: EventBusService,
  ) {
    this.logger = this.loggerFactory.create('discord-standup-interaction')
  }

  async handle(
    action: StandupAction,
    standupId: string,
    actorDiscordId: string,
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
    const found = await this.standupRepository.findByIdForUser(
      standupId,
      actorUserId,
    )
    if (found.isErr()) {
      return found
    }

    switch (action) {
      case 'approve':
        return this.handleApprove(found.value, actorUserId)
      case 'reject':
        return this.handleReject(found.value, actorUserId)
      case 'regenerate':
        return this.handleRegenerate(found.value, actorUserId)
    }
  }

  private async handleApprove(
    record: StandupRecord,
    actorUserId: string,
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const approveResult = await this.standupRepository.updateStatusForUser(
      record.id,
      actorUserId,
      'approved',
    )
    if (approveResult.isErr()) {
      return approveResult
    }

    if (!this.env.discord.channelId) {
      this.emitStatusChanged(actorUserId, record.id, 'approved')
      return Result.ok({
        action: 'approve',
        standupId: record.id,
        userId: actorUserId,
        newStatus: 'approved',
        message: 'Standup aprovado!',
      })
    }

    const publishResult = await this.messages.publishStandup(
      approveResult.value,
      this.env.discord.channelId,
    )
    if (publishResult.isErr()) {
      this.logger.warn('Failed to publish standup after approval', {
        standupId: record.id,
        error: publishResult.error.message,
      })
      this.emitStatusChanged(actorUserId, record.id, 'approved')
      return Result.ok({
        action: 'approve',
        standupId: record.id,
        userId: actorUserId,
        newStatus: 'approved',
        message:
          'Standup aprovado! A publicação falhou e pode ser feita manualmente.',
      })
    }

    const publishedResult = await this.standupRepository.updateStatusForUser(
      record.id,
      actorUserId,
      'published',
    )
    if (publishedResult.isErr()) {
      this.logger.warn('Failed to mark standup as published', {
        standupId: record.id,
        error: publishedResult.error.message,
      })
      this.emitStatusChanged(actorUserId, record.id, 'approved')
      return Result.ok({
        action: 'approve',
        standupId: record.id,
        userId: actorUserId,
        newStatus: 'approved',
        message: 'Standup aprovado e publicado no canal!',
      })
    }

    this.emitStatusChanged(actorUserId, record.id, 'published')
    return Result.ok({
      action: 'approve',
      standupId: record.id,
      userId: actorUserId,
      newStatus: 'published',
      message: 'Standup aprovado e publicado no canal!',
    })
  }

  private async handleReject(
    record: StandupRecord,
    actorUserId: string,
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const result = await this.standupRepository.updateStatusForUser(
      record.id,
      actorUserId,
      'rejected',
    )
    if (result.isErr()) {
      return result
    }

    this.emitStatusChanged(actorUserId, record.id, 'rejected')
    return Result.ok({
      action: 'reject',
      standupId: record.id,
      userId: actorUserId,
      newStatus: 'rejected',
      message:
        'Standup rejeitado. Gere uma nova versão ou aguarde o próximo cron.',
    })
  }

  private async handleRegenerate(
    record: StandupRecord,
    actorUserId: string,
  ): Promise<Result<InteractionOutcome, InteractionError>> {
    const result = await this.standupRepository.updateStatusForUser(
      record.id,
      actorUserId,
      'rejected',
    )
    if (result.isErr()) {
      return result
    }

    this.emitStatusChanged(actorUserId, record.id, 'rejected')
    return Result.ok({
      action: 'regenerate',
      standupId: record.id,
      userId: actorUserId,
      newStatus: 'rejected',
      message: 'Standup rejeitado para regeneração.',
    })
  }

  private emitStatusChanged(
    userId: string,
    standupId: string,
    newStatus: 'approved' | 'rejected' | 'published',
  ): void {
    this.eventBus.emitStandupStatusChanged({
      userId,
      standupId,
      newStatus,
      source: 'discord',
    })
  }
}
