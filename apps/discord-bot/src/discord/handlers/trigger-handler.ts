import { getDb, UserRepository } from '@standup/db'
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
  internalSecret: string
  databaseUrl: string
}

/**
 * Processa os botões de confirmação do /standup trigger.
 * - confirm: dispara o trigger manual com as opções salvas
 * - cancel: cancela a operação
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
      content: '❌ Ação de trigger desconhecida.',
      components: [],
    })
    return
  }

  const pendingRequest = consumePendingTriggerRequest(requestId)

  if (!pendingRequest) {
    await interaction.editReply({
      content:
        '⌛ Esta confirmação expirou. Rode `/standup trigger` novamente para criar uma nova solicitação.',
      components: [],
    })
    return
  }

  if (pendingRequest.discordUserId !== interaction.user.id) {
    interactionLogger.warn('Trigger confirmation denied: user mismatch', {
      requestUserId: pendingRequest.discordUserId,
    })
    await interaction.editReply({
      content: '❌ Esta confirmação pertence a outro usuário.',
      components: [],
    })
    return
  }

  if (action === 'cancel') {
    interactionLogger.info('Manual trigger cancelled by user')
    await interaction.editReply({
      content: '❌ Operação cancelada.',
      components: [],
    })
    return
  }

  // Resolve userId from discordUserId (requires active session)
  const db = getDb(deps.databaseUrl)
  const userRepo = new UserRepository(db)
  const userIdResult = await userRepo.hasActiveSession(
    pendingRequest.discordUserId,
  )
  if (
    userIdResult.isErr() ||
    !userIdResult.value ||
    !userIdResult.value.hasSession
  ) {
    await interaction.editReply({
      content:
        '❌ Sessão expirada ou usuário não registrado. Use `/login` para reconectar.',
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
    userIdResult.value.userId,
    pendingRequest.discordUserId,
    { apiBaseUrl: deps.apiBaseUrl, internalSecret: deps.internalSecret },
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
      content: '❌ Você não está autorizado a disparar o standup manualmente.',
      components: [],
    })
    return
  }

  if (
    !result.value.accepted &&
    result.value.reason === 'pending_review_exists'
  ) {
    await interaction.editReply({
      content:
        '⚠️ Já existe um standup de hoje aguardando revisão. Aprove ou rejeite o standup atual antes de gerar um novo.',
      components: [],
    })
    return
  }

  if (
    !result.value.accepted &&
    result.value.reason === 'already_approved_today'
  ) {
    await interaction.editReply({
      content:
        '✅ O standup de hoje já foi gerado e aprovado. Verifique sua DM ou use `/standup list` para consultar o status.',
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
      '✅ Trigger manual enviado com sucesso. O job foi aceito e está processando em background.\n\nVocê receberá uma DM quando o standup estiver pronto para revisão.',
    components: [],
  })
}
