import { getDb, StandupRepository, UserRepository } from '@standup/db'
import type { StandupStatus } from '@standup/domain'
import {
  DbError,
  ExternalServiceError,
  NotFoundError,
  Result,
} from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import type { Client } from 'discord.js'
import { publishStandup } from '../discord/notifications/publish-standup.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'standup-sync-service',
})

// Emojis de feedback visual quando a ação vem da web (Padrão 2 do Akita)
const STATUS_EMOJI: Partial<Record<StandupStatus, string>> = {
  approved: '\u{2705}', // ✅
  rejected: '\u{274C}', // ❌
  published: '\u{2705}', // ✅
}

export interface SyncStandupStatusDeps {
  databaseUrl: string
  client: Client
  discordChannelId: string
}

export interface SyncStandupStatusInput {
  standupId: string
  newStatus: StandupStatus
}

type SyncError = NotFoundError | DbError | ExternalServiceError

/**
 * Sincroniza o estado do standup no Discord após uma ação feita via Web.
 *
 * 1. Busca o standup no DB (para obter dmMessageId e userId).
 * 2. Resolve o discordUserId do userId via UserRepository.
 * 3. Se houver dmMessageId: edita a DM removendo os botões e mostrando emoji de status.
 * 4. Se newStatus === 'approved': publica embed verde no canal + transiciona approved → published.
 *
 * Todas as etapas são non-fatal entre si — se a DM falhar, tenta publicar.
 * O resultado final indica se ao menos uma ação foi realizada.
 */
export async function syncStandupStatus(
  input: SyncStandupStatusInput,
  deps: SyncStandupStatusDeps,
): Promise<Result<void, SyncError>> {
  const syncLogger = withContext(logger, {
    standupId: input.standupId,
    newStatus: input.newStatus,
  })

  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  const userRepo = new UserRepository(db)

  // 1. Buscar standup
  const found = await repo.findById(input.standupId)
  if (found.isErr()) {
    syncLogger.warn('Standup not found for sync', {
      error: found.error.message,
    })
    return found
  }

  const record = found.value

  // 2. Resolver discordUserId a partir do userId
  let discordUserId: string | undefined
  if (record.userId) {
    const accountResult = userRepo.findDiscordIdByUserId(record.userId)
    if (accountResult.isOk() && accountResult.value) {
      discordUserId = accountResult.value
    } else {
      syncLogger.warn(
        'Could not resolve discordUserId from userId — DM edit skipped',
        {
          userId: record.userId,
        },
      )
    }
  }

  // 3. Editar a DM (remover botões + emoji de status) — non-fatal
  if (record.dmMessageId && discordUserId) {
    const emoji = STATUS_EMOJI[input.newStatus] ?? '\u{2139}' // ℹ️ fallback
    const statusLabel =
      input.newStatus === 'approved' || input.newStatus === 'published'
        ? 'Aprovado e publicado via web'
        : input.newStatus === 'rejected'
          ? 'Rejeitado via web'
          : `Status atualizado via web: ${input.newStatus}`

    try {
      const user = await deps.client.users.fetch(discordUserId)
      const dmChannel = await user.createDM()
      const message = await dmChannel.messages.fetch(record.dmMessageId)
      await message.edit({
        content: `${emoji} ${statusLabel}`,
        components: [], // remove os botões
      })
      syncLogger.info('DM message updated after web action', {
        messageId: record.dmMessageId,
        newStatus: input.newStatus,
      })
    } catch (err) {
      syncLogger.warn('Failed to edit DM message — non-fatal', {
        messageId: record.dmMessageId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    syncLogger.info('No DM message to update', {
      hasDmMessageId: Boolean(record.dmMessageId),
      hasDiscordUserId: Boolean(discordUserId),
    })
  }

  // 4. Se aprovado: publicar no canal + transicionar approved → published
  if (input.newStatus === 'approved') {
    const publishResult = await publishStandup(
      record,
      deps.client,
      deps.discordChannelId,
    )

    if (publishResult.isErr()) {
      syncLogger.warn(
        'Failed to publish standup after web approve — non-fatal',
        {
          error: publishResult.error.message,
        },
      )
      return Result.ok(undefined)
    }

    syncLogger.info('Standup published to channel after web approve')

    // Transicionar approved → published
    const publishedResult = await repo.updateStatus(
      input.standupId,
      'published',
    )
    if (publishedResult.isErr()) {
      syncLogger.warn(
        'Published to Discord but failed to transition to published',
        {
          error: publishedResult.error.message,
        },
      )
    } else {
      syncLogger.info('Standup transitioned to published')
    }
  }

  return Result.ok(undefined)
}
