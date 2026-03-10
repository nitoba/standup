import { getDb, StandupRepository } from '@standup/db'
import type { StandupRecord } from '@standup/domain'
import {
  DbError,
  ExternalServiceError,
  NotFoundError,
  Result,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { sendReviewDm } from '../discord/notifications/send-review-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'standup-notification-service',
})

export interface StandupNotificationDeps {
  databaseUrl: string
  client: Client
  discordUserId: string
}

export interface StandupReadyResult {
  standupId: string
  dmSent: boolean
  transitioned: boolean
}

/**
 * Busca o standup no DB, envia DM de revisão ao usuário e
 * transiciona o status de draft → pending_review.
 *
 * A DM é non-fatal: se falhar, o standup está salvo e pode ser aprovado via API.
 * A transição também é non-fatal: se falhar, o status permanece draft (recuperável).
 */
export async function notifyStandupReady(
  standupId: string,
  deps: StandupNotificationDeps,
): Promise<Result<StandupReadyResult, NotFoundError | DbError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)

  const found = await repo.findById(standupId)
  if (found.isErr()) return found

  const record: StandupRecord = found.value

  // Enviar DM — non-fatal
  const dmResult = await sendReviewDm(record, {
    client: deps.client,
    discordUserId: deps.discordUserId,
  })

  if (dmResult.isErr()) {
    logger.warn('Failed to send review DM — standup saved, approve manually', {
      standupId,
      error: dmResult.error.message,
    })
    return Result.ok({ standupId, dmSent: false, transitioned: false })
  }

  const { messageId } = dmResult.value
  logger.info('Review DM sent successfully', { standupId, messageId })

  // Persistir dmMessageId — non-fatal: se falhar, o standup ainda pode ser aprovado
  const saveMessageIdResult = await repo.updateDmMessageId(standupId, messageId)
  if (saveMessageIdResult.isErr()) {
    logger.warn(
      'Failed to save dmMessageId — DM was sent but ID not persisted',
      {
        standupId,
        messageId,
        error: saveMessageIdResult.error.message,
      },
    )
  }

  // Transicionar draft → pending_review — non-fatal
  const transitionResult = await repo.updateStatus(standupId, 'pending_review')
  if (transitionResult.isErr()) {
    logger.warn('Failed to transition standup to pending_review', {
      standupId,
      error: transitionResult.error.message,
    })
    return Result.ok({ standupId, dmSent: true, transitioned: false })
  }

  logger.info('Standup transitioned to pending_review', { standupId })
  return Result.ok({ standupId, dmSent: true, transitioned: true })
}

export type { ExternalServiceError }
