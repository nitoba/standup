import type { BotEnv } from '@standup/config'
import { createServiceLogger, withContext } from '@standup/logger'
import type { ChatInputCommandInteraction, Client } from 'discord.js'
import { handleApproveCommand } from '../commands/approve.js'
import { handleList } from '../commands/list.js'
import { handleTrigger } from '../commands/trigger.js'
import { handleStandupInteraction } from './interaction-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'slash-command-handler',
})

/**
 * Routes /standup subcommands to their respective handlers.
 * Only handles the 'standup' command — ignores everything else.
 * Padrão 13 do Akita: Application Commands bridge.
 */
export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  env: Pick<BotEnv, 'DATABASE_URL' | 'DISCORD_CHANNEL_ID' | 'API_BASE_URL'>,
): Promise<void> {
  if (interaction.commandName !== 'standup') return

  const sub = interaction.options.getSubcommand()

  withContext(logger, {
    command: `standup ${sub}`,
    userId: interaction.user.id,
  }).info('Received slash command')

  if (sub === 'trigger') {
    await handleTrigger(interaction, { apiBaseUrl: env.API_BASE_URL })
  } else if (sub === 'list') {
    await handleList(interaction, { databaseUrl: env.DATABASE_URL })
  } else if (sub === 'approve') {
    await handleApproveCommand(interaction, client, {
      databaseUrl: env.DATABASE_URL,
      discordChannelId: env.DISCORD_CHANNEL_ID,
      handleInteraction: handleStandupInteraction,
    })
  }
}
