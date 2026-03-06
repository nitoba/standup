import { createServiceLogger, withContext } from '@standup/logger'
import type { ButtonInteraction } from 'discord.js'
import { triggerStandup } from '../../services/trigger-standup-service.js'
import { consumePendingTriggerRequest } from './trigger-request-store.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'trigger-handler',
})

export type TriggerAction = 'confirm' | 'cancel'

export interface TriggerHandlerDeps {
  apiBaseUrl: string
}

/**
 * Processa os botoes de confirmacao do /standup trigger.
 * - confirm: dispara o trigger manual com as opcoes salvas
 * - cancel: cancela a operacao
 */
export async function handleTriggerButtonInteraction(
  interaction: ButtonInteraction,
  action: TriggerAction,
  requestId: string,
  deps: TriggerHandlerDeps,
): Promise<void> {
  const interactionLogger = withContext(logger, {
    action,
    requestId,
    userId: interaction.user.id,
  })

  await interaction.deferUpdate()

  if (action !== 'confirm' && action !== 'cancel') {
    await interaction.editReply({
      content: '❌ Acao de trigger desconhecida.',
      components: [],
    })
    return
  }

  const pendingRequest = consumePendingTriggerRequest(requestId)

  if (!pendingRequest) {
    await interaction.editReply({
      content:
        '⌛ Esta confirmacao expirou. Rode `/standup trigger` novamente para criar uma nova solicitacao.',
      components: [],
    })
    return
  }

  if (pendingRequest.discordUserId !== interaction.user.id) {
    interactionLogger.warn('Trigger confirmation denied: user mismatch', {
      requestUserId: pendingRequest.discordUserId,
    })
    await interaction.editReply({
      content: '❌ Esta confirmacao pertence a outro usuario.',
      components: [],
    })
    return
  }

  if (action === 'cancel') {
    interactionLogger.info('Manual trigger cancelled by user')
    await interaction.editReply({
      content: '❌ Operacao cancelada.',
      components: [],
    })
    return
  }

  // Remove os botoes imediatamente para evitar cliques duplicados
  // enquanto o request HTTP para a API ainda esta em andamento.
  await interaction.editReply({
    content: '⏳ Processando trigger manual...',
    components: [],
  })

  const result = await triggerStandup(
    pendingRequest.discordUserId,
    { apiBaseUrl: deps.apiBaseUrl },
    pendingRequest.options,
  )

  if (result.isErr()) {
    interactionLogger.error('Failed to execute manual trigger', {
      error: result.error.message,
    })
    await interaction.editReply({
      content: `❌ Falha ao disparar o standup agora.\n\nDetalhe: ${result.error.message}`,
      components: [],
    })
    return
  }

  if (!result.value.accepted && result.value.reason === 'forbidden') {
    await interaction.editReply({
      content: '❌ Voce nao esta autorizado a disparar o standup manualmente.',
      components: [],
    })
    return
  }

  interactionLogger.info('Manual trigger accepted after user confirmation', {
    forceRegenerate: pendingRequest.options.forceRegenerate ?? false,
    hasExtraContext: !!pendingRequest.options.extraContext,
  })

  await interaction.editReply({
    content:
      '✅ Trigger manual enviado com sucesso. O job foi aceito e comecou a processar em background.',
    components: [],
  })
}
