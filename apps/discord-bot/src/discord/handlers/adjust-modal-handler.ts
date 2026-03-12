import type { BotEnv } from '@standup/config'
import { getDb, UserRepository } from '@standup/db'
import { createServiceLogger, withContext } from '@standup/logger'
import type { Client, ModalSubmitInteraction } from 'discord.js'
import { triggerStandup } from '../../services/trigger-standup-service.js'
import { updateReviewMessage } from './update-review-message.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'adjust-modal-handler',
})

/**
 * Handles the adjust modal submission.
 * Triggers a new generation using the previous standup content as rewrite base.
 */
export async function handleAdjustModal(
  interaction: ModalSubmitInteraction,
  _client: Client,
  env: Pick<BotEnv, 'API_BASE_URL' | 'INTERNAL_SECRET' | 'DATABASE_URL'>,
): Promise<void> {
  const [namespace, standupId] = interaction.customId.split(':')
  if (namespace !== 'standup-adjust-modal' || !standupId) return

  const rewriteInstruction =
    interaction.fields.getTextInputValue('adjust-instruction')?.trim() || ''

  const modalLogger = withContext(logger, {
    standupId,
    userId: interaction.user.id,
    hasInstruction: !!rewriteInstruction,
  })
  modalLogger.info('Adjust modal submitted')

  await interaction.deferUpdate()
  await updateReviewMessage(interaction, {
    content:
      '⏳ Solicitação recebida. Estou preparando uma nova versão do standup com base no texto atual...',
    components: [],
  })

  if (!rewriteInstruction) {
    await updateReviewMessage(interaction, {
      content:
        '❌ Informe as alterações desejadas para ajustar o standup (ex.: remover item X, adicionar item Y).',
      components: [],
    })
    return
  }

  // Resolve userId from Discord ID (requires active session)
  const db = getDb(env.DATABASE_URL)
  const userRepo = new UserRepository(db)
  const userIdResult = await userRepo.hasActiveSession(interaction.user.id)
  if (
    userIdResult.isErr() ||
    !userIdResult.value ||
    !userIdResult.value.hasSession
  ) {
    await updateReviewMessage(interaction, {
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
      components: [],
    })
    return
  }

  const triggerResult = await triggerStandup(
    userIdResult.value.userId,
    interaction.user.id,
    { apiBaseUrl: env.API_BASE_URL, internalSecret: env.INTERNAL_SECRET },
    {
      forceRegenerate: true,
      rewriteFromStandupId: standupId,
      rewriteInstruction,
      replaceStandupId: standupId,
    },
  )

  if (triggerResult.isErr()) {
    modalLogger.error('Failed to trigger adjusted regeneration', {
      error: triggerResult.error.message,
    })
    await updateReviewMessage(interaction, {
      content:
        '❌ Falha ao disparar ajuste do standup. Tente novamente em instantes.',
      components: [],
    })
    return
  }

  if (!triggerResult.value.accepted) {
    await updateReviewMessage(interaction, {
      content: '❌ Você não está autorizado a disparar ajuste do standup.',
      components: [],
    })
    return
  }

  modalLogger.info('Adjusted regeneration triggered successfully')
  await updateReviewMessage(interaction, {
    content:
      '🛠️ Ajuste solicitado com sucesso. Vou gerar uma nova versão com base no texto anterior e nas alterações pedidas.',
    components: [],
  })
}
