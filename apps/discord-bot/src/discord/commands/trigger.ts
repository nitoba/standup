import { createServiceLogger } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  MessageFlags,
} from 'discord.js'
import { createPendingTriggerRequest } from '../handlers/trigger-request-store.js'

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
 * Nao dispara imediatamente: pede confirmacao via botoes em mensagem ephemeral.
 */
export async function handleTrigger(
  interaction: ChatInputCommandInteraction,
  _deps: TriggerCommandDeps,
): Promise<void> {
  const userId = interaction.user.id
  const forceRegenerate =
    interaction.options.getBoolean('force-regenerate') ?? false
  const extraContext =
    interaction.options.getString('extra-context') ?? undefined

  logger.info('Received /standup trigger command', {
    userId,
    forceRegenerate,
    hasExtraContext: !!extraContext,
  })

  const request = createPendingTriggerRequest(userId, {
    forceRegenerate,
    extraContext,
  })

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`standup-trigger:confirm:${request.id}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`standup-trigger:cancel:${request.id}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  )

  const details = [
    `- force-regenerate: ${forceRegenerate ? 'true' : 'false'}`,
    `- extra-context: ${extraContext ? 'informado' : 'vazio'}`,
  ].join('\n')

  await interaction.reply({
    ...ephemeral(
      `Confirme a geracao manual do standup:\n${details}\n\nEsta confirmacao expira em 5 minutos.`,
    ),
    components: [row],
  })
}
