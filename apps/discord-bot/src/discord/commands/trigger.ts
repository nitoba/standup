import { createServiceLogger } from '@standup/logger'
import {
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  MessageFlags,
} from 'discord.js'
import { triggerStandup } from '../../services/trigger-standup-service.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-trigger',
})

function ephemeral(content: string): InteractionReplyOptions {
  return { content, flags: MessageFlags.Ephemeral }
}

export interface TriggerCommandDeps {
  apiBaseUrl: string
}

/**
 * Handler para /standup trigger.
 * Dispara POST /standups/trigger enviando o userId do Discord para autorizacao.
 */
export async function handleTrigger(
  interaction: ChatInputCommandInteraction,
  deps: TriggerCommandDeps,
): Promise<void> {
  const userId = interaction.user.id

  logger.info('Received /standup trigger command', { userId })

  const result = await triggerStandup(userId, { apiBaseUrl: deps.apiBaseUrl })

  if (result.isErr()) {
    await interaction.reply(
      ephemeral(
        `Falha ao disparar o standup agora. Tente novamente em instantes.\n\nDetalhe: ${result.error.message}`,
      ),
    )
    return
  }

  if (!result.value.accepted && result.value.reason === 'forbidden') {
    await interaction.reply(
      ephemeral('Voce nao esta autorizado a disparar o standup manualmente.'),
    )
    return
  }

  await interaction.reply(
    ephemeral(
      'Trigger manual enviado com sucesso. O job foi aceito e comecou a processar em background.',
    ),
  )
}
