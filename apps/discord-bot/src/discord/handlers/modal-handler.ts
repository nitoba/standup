import type { BotEnv } from '@standup/config'
import { getDb, UserRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import type { Client, ModalSubmitInteraction } from 'discord.js'
import {
  type TriggerStandupOptions,
  triggerStandup,
} from '../../services/trigger-standup-service.js'
import { handleStandupInteraction } from './interaction-handler.js'
import { updateReviewMessage } from './update-review-message.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'modal-handler',
})

/**
 * Handles the full regenerate modal submission (from scratch).
 *
 * Flow:
 * 1. Parse standupId from customId (standup-regenerate-modal:<standupId>)
 * 2. Extract optional extra context from the text input
 * 3. Defer the update (acknowledge to Discord)
 * 4. Reject the current standup via handleStandupInteraction
 * 5. Trigger a new standup generation from scratch via API
 *    with optional extraContext + forceRegenerate
 * 6. Edit the original message with feedback
 */
export async function handleRegenerateModal(
  interaction: ModalSubmitInteraction,
  _client: Client,
  env: Pick<
    BotEnv,
    'DATABASE_URL' | 'DISCORD_CHANNEL_ID' | 'API_BASE_URL' | 'INTERNAL_SECRET'
  >,
): Promise<void> {
  const [namespace, standupId] = interaction.customId.split(':')
  if (namespace !== 'standup-regenerate-modal' || !standupId) return

  const extraContext =
    interaction.fields.getTextInputValue('regenerate-context')?.trim() || ''

  const modalLogger = withContext(logger, {
    standupId,
    userId: interaction.user.id,
    hasExtraContext: !!extraContext,
  })
  modalLogger.info('Full regenerate modal submitted')

  await interaction.deferUpdate()
  await updateReviewMessage(interaction, {
    content:
      '⏳ Solicitacao recebida. Estou rejeitando o standup atual e iniciando a regeneracao do zero...',
    components: [],
  })

  // Step 1: Reject the current standup
  const rejectResult = await handleStandupInteraction('regenerate', standupId, {
    actorDiscordId: interaction.user.id,
    databaseUrl: env.DATABASE_URL,
  })

  if (rejectResult.isErr()) {
    modalLogger.error('Failed to reject standup for regeneration', {
      error: rejectResult.error.message,
    })
    await updateReviewMessage(interaction, {
      content: `\u{274C} Erro ao rejeitar standup atual: ${rejectResult.error.message}`,
      components: [],
    })
    return
  }

  // Step 2: Resolve userId from Discord ID
  const db = getDb(env.DATABASE_URL)
  const userRepo = new UserRepository(db)
  const userIdResult = userRepo.findUserIdByDiscordId(interaction.user.id)
  if (userIdResult.isErr() || !userIdResult.value) {
    await updateReviewMessage(interaction, {
      content: '\u{274C} Usuário não registrado. Use /login primeiro.',
      components: [],
    })
    return
  }

  // Step 3: Trigger new generation via API (full regenerate)
  const triggerOptions: TriggerStandupOptions = {
    forceRegenerate: true,
    ...(extraContext ? { extraContext } : {}),
  }

  const triggerResult = await triggerStandup(
    userIdResult.value,
    interaction.user.id,
    { apiBaseUrl: env.API_BASE_URL, internalSecret: env.INTERNAL_SECRET },
    triggerOptions,
  )

  if (triggerResult.isErr()) {
    modalLogger.error('Failed to trigger regeneration', {
      error: triggerResult.error.message,
    })
    await updateReviewMessage(interaction, {
      content:
        '\u{274C} Standup rejeitado, mas falhou ao disparar regeneracao. Use /standup trigger para tentar novamente.',
      components: [],
    })
    return
  }

  if (!triggerResult.value.accepted) {
    modalLogger.warn('Regeneration trigger not accepted', {
      reason:
        'reason' in triggerResult.value
          ? triggerResult.value.reason
          : 'unknown',
    })
    await updateReviewMessage(interaction, {
      content:
        '\u{274C} Standup rejeitado, mas voce nao esta autorizado a disparar o trigger.',
      components: [],
    })
    return
  }

  const contextMsg = extraContext ? `\nContexto: _${extraContext}_` : ''

  modalLogger.info('Full regeneration triggered successfully')
  await updateReviewMessage(interaction, {
    content: `\u{1F504} Regenerando standup do zero...${contextMsg}\nVoce recebera uma nova DM quando estiver pronto.`,
    components: [],
  })
}
