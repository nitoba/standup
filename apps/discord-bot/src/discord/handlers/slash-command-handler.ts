import type { BotEnv } from '@standup/config'
import { createServiceLogger, withContext } from '@standup/logger'
import type { ChatInputCommandInteraction, Client } from 'discord.js'
import { requireAuth } from '../auth/require-auth.js'
import { handleApproveCommand } from '../commands/approve.js'
import { handleList } from '../commands/list.js'
import { handleServices } from '../commands/services.js'
import { handleSettings } from '../commands/settings.js'
import { handleTrigger } from '../commands/trigger.js'
import { handleStandupInteraction } from './interaction-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'slash-command-handler',
})

/** Subcommands that require authentication. */
const AUTH_REQUIRED_SUBCOMMANDS = new Set([
  'trigger',
  'list',
  'approve',
  'services',
  'settings',
])

/**
 * Routes /standup subcommands to their respective handlers.
 * Only handles the 'standup' command — ignores everything else.
 * Padrão 13 do Akita: Application Commands bridge.
 *
 * Auth guard: subcommands in AUTH_REQUIRED_SUBCOMMANDS check if the
 * Discord user is registered before proceeding. Unregistered users
 * get an ephemeral message with a login link.
 */
export async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
  env: Pick<
    BotEnv,
    | 'DATABASE_URL'
    | 'DISCORD_CHANNEL_ID'
    | 'API_BASE_URL'
    | 'WORKER_INTERNAL_URL'
    | 'INTERNAL_SECRET'
  >,
): Promise<void> {
  if (interaction.commandName !== 'standup') return

  const sub = interaction.options.getSubcommand()

  withContext(logger, {
    command: `standup ${sub}`,
    userId: interaction.user.id,
  }).info('Received slash command')

  // Auth guard for protected subcommands
  if (AUTH_REQUIRED_SUBCOMMANDS.has(sub)) {
    const isAuthed = await requireAuth(interaction, {
      databaseUrl: env.DATABASE_URL,
      apiBaseUrl: env.API_BASE_URL,
    })
    if (!isAuthed) return
  }

  if (sub === 'trigger') {
    await handleTrigger(interaction, { apiBaseUrl: env.API_BASE_URL })
  } else if (sub === 'services') {
    await handleServices(interaction, {
      apiBaseUrl: env.API_BASE_URL,
      workerInternalUrl: env.WORKER_INTERNAL_URL,
      client,
    })
  } else if (sub === 'list') {
    await handleList(interaction, { databaseUrl: env.DATABASE_URL })
  } else if (sub === 'approve') {
    await handleApproveCommand(interaction, client, {
      databaseUrl: env.DATABASE_URL,
      discordChannelId: env.DISCORD_CHANNEL_ID,
      handleInteraction: handleStandupInteraction,
    })
  } else if (sub === 'settings') {
    await handleSettings(interaction, {
      databaseUrl: env.DATABASE_URL,
      workerInternalUrl: env.WORKER_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
    })
  }
}
