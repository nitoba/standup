import { getDb, StandupRepository, UserRepository } from '@standup/db'
import type { StandupRecord } from '@standup/domain'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import type { Client } from 'discord.js'
import { publishStandup } from '../notifications/publish-standup.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'interaction-handler',
})

export type StandupAction = 'approve' | 'reject' | 'regenerate'

export interface InteractionOutcome {
  action: StandupAction
  standupId: string
  message: string
}

export interface InteractionDeps {
  databaseUrl: string
  discordChannelId?: string
  actorDiscordId: string
}

type InteractionError =
  | NotFoundError
  | InvalidStateTransitionError
  | DbError
  | ValidationError

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleApprove(
  record: StandupRecord,
  repo: StandupRepository,
  actorUserId: string,
  deps: InteractionDeps,
  client?: Client,
): Promise<Result<InteractionOutcome, InteractionError>> {
  // pending_review → approved
  const approveResult = await repo.updateStatusForUser(
    record.id,
    actorUserId,
    'approved',
  )
  if (approveResult.isErr()) return approveResult

  const approvedRecord = approveResult.value

  // Publish to Discord channel (non-fatal)
  if (deps.discordChannelId && client) {
    const publishResult = await publishStandup(
      approvedRecord,
      client,
      deps.discordChannelId,
    )

    if (publishResult.isErr()) {
      logger.warn('Failed to publish standup to channel', {
        standupId: record.id,
        error: publishResult.error.message,
      })
      return Result.ok({
        action: 'approve',
        standupId: record.id,
        message:
          'Standup aprovado! A publicação falhou — publique manualmente no canal.',
      })
    }

    // approved → published
    const publishedResult = await repo.updateStatusForUser(
      record.id,
      actorUserId,
      'published',
    )
    if (publishedResult.isErr()) {
      logger.warn('Failed to transition standup to published', {
        standupId: record.id,
        error: publishedResult.error.message,
      })
    }
  }

  return Result.ok({
    action: 'approve',
    standupId: record.id,
    message: 'Standup aprovado e publicado no canal!',
  })
}

async function handleReject(
  record: StandupRecord,
  repo: StandupRepository,
  actorUserId: string,
): Promise<Result<InteractionOutcome, InteractionError>> {
  const result = await repo.updateStatusForUser(
    record.id,
    actorUserId,
    'rejected',
  )
  if (result.isErr()) return result

  return Result.ok({
    action: 'reject',
    standupId: record.id,
    message:
      'Standup rejeitado. Use o comando de standup ou aguarde o próximo cron para gerar um novo.',
  })
}

async function handleRegenerate(
  record: StandupRecord,
  repo: StandupRepository,
  actorUserId: string,
): Promise<Result<InteractionOutcome, InteractionError>> {
  // Rejeita o standup atual. O trigger de regeneracao e feito pelo modal-handler.
  const result = await repo.updateStatusForUser(
    record.id,
    actorUserId,
    'rejected',
  )
  if (result.isErr()) return result

  return Result.ok({
    action: 'regenerate',
    standupId: record.id,
    message: 'Standup rejeitado para regeneracao.',
  })
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Processa uma ação de botão do Discord (approve/reject/regenerate).
 * Coordena a lógica de transição de estado e efeitos colaterais.
 *
 * @param action - Ação disparada pelo botão
 * @param standupId - ID do standup a ser processado
 * @param deps - Dependências (DB URL, canal Discord)
 * @param client - Cliente Discord (necessário apenas para approve com publicação)
 */
export async function handleStandupInteraction(
  action: StandupAction,
  standupId: string,
  deps: InteractionDeps,
  client?: Client,
): Promise<Result<InteractionOutcome, InteractionError>> {
  const actionLogger = withContext(logger, { action, standupId })

  // Validar ação antes de qualquer I/O
  if (action !== 'approve' && action !== 'reject' && action !== 'regenerate') {
    return Result.err(
      new ValidationError({
        field: 'action',
        message: `Unknown standup action: ${String(action)}`,
      }),
    )
  }

  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  const userRepo = new UserRepository(db)

  const actorResult = userRepo.findUserIdByDiscordId(deps.actorDiscordId)
  if (actorResult.isErr() || !actorResult.value) {
    actionLogger.warn('Actor could not be resolved for standup interaction', {
      actorDiscordId: deps.actorDiscordId,
      error: actorResult.isErr() ? actorResult.error.message : 'not found',
    })
    return Result.err(new NotFoundError({ resource: 'standup', id: standupId }))
  }

  const actorUserId = actorResult.value

  // Buscar standup com ownership check
  const found = await repo.findByIdForUser(standupId, actorUserId)
  if (found.isErr()) {
    actionLogger.warn('Standup not found for interaction', {
      error: found.error.message,
    })
    return found
  }

  const record = found.value
  actionLogger.info('Processing standup interaction', { status: record.status })

  switch (action) {
    case 'approve':
      return handleApprove(record, repo, actorUserId, deps, client)
    case 'reject':
      return handleReject(record, repo, actorUserId)
    case 'regenerate':
      return handleRegenerate(record, repo, actorUserId)
  }
}
