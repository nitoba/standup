import { createServiceLogger } from '@standup/logger'
import type { ChatInputCommandInteraction, Client } from 'discord.js'
import type { handleStandupInteraction } from '../handlers/interaction-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-approve',
})

export interface ApproveCommandDeps {
  databaseUrl: string
  discordChannelId: string
  handleInteraction: typeof handleStandupInteraction
}

/**
 * Handler para /standup approve <id>.
 * Reutiliza a lógica de handleStandupInteraction (mesma do botão Aprovar).
 * Padrão 13 do Akita: bridge Application Command → lógica existente.
 */
export async function handleApproveCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  deps: ApproveCommandDeps,
): Promise<void> {
  const standupId = interaction.options.getString('id', true)

  logger.info('Received /standup approve command', {
    userId: interaction.user.id,
    standupId,
  })

  await interaction.deferReply({ ephemeral: true })

  const result = await deps.handleInteraction(
    'approve',
    standupId,
    {
      databaseUrl: deps.databaseUrl,
      discordChannelId: deps.discordChannelId,
    },
    client,
  )

  if (result.isOk()) {
    await interaction.editReply(`\u{2705} ${result.value.message}`)
  } else {
    await interaction.editReply(
      `\u{274C} Erro ao aprovar: ${result.error.message}`,
    )
  }
}
