import { createServiceLogger } from '@standup/logger'
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-trigger',
})

function ephemeral(content: string): InteractionReplyOptions {
  return { content, ephemeral: true }
}

/**
 * Handler para /standup trigger.
 * Stub até o Slice 6 (API) estar disponível com POST /standups/trigger.
 * Padrão 13 do Akita: comando registrado com resposta ephemeral.
 */
export async function handleTrigger(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  logger.info('Received /standup trigger command', {
    userId: interaction.user.id,
  })

  await interaction.reply(
    ephemeral(
      '\u{1F504} Trigger manual disponível via API em breve.\n' +
        'Use `POST /standups/trigger` para disparar um job agora.',
    ),
  )
}
