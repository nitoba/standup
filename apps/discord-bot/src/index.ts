import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { handleApproveCommand } from './discord/commands/approve.js'
import { handleList } from './discord/commands/list.js'
import { registerApplicationCommands } from './discord/commands/register.js'
import { handleTrigger } from './discord/commands/trigger.js'
import type { StandupAction } from './discord/interaction-handler.js'
import { handleStandupInteraction } from './discord/interaction-handler.js'
import { createInternalRouter } from './http/internal-routes.js'

// Padrão 2 do Akita: emojis de status como feedback visual instantâneo
const STATUS_EMOJI: Record<string, string> = {
  approve: '\u{2705}', // ✅ checkmark
  reject: '\u{274C}', // ❌ red X
  regenerate: '\u{1F504}', // 🔄 refresh arrows
}

export async function startDiscordBot(): Promise<void> {
  const logger = createServiceLogger({
    service: 'discord-bot',
    component: 'gateway',
  })

  const envResult = loadEnv()
  if (Result.isError(envResult)) {
    throw new Error(`Invalid environment: ${envResult.error.message}`)
  }

  const env = envResult.value

  // ---------------------------------------------------------------------------
  // Discord gateway — único Client para todo o processo
  // ---------------------------------------------------------------------------

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  // ---------------------------------------------------------------------------
  // HTTP server for internal routes (worker → bot notifications)
  // O client é passado aqui para que send-review-dm use a mesma conexão.
  // ---------------------------------------------------------------------------

  const internalApp = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    databaseUrl: env.DATABASE_URL,
    client,
    discordUserId: env.DISCORD_USER_ID,
    discordChannelId: env.DISCORD_CHANNEL_ID,
  })

  Bun.serve({
    port: env.BOT_INTERNAL_PORT,
    fetch: internalApp.fetch,
  })

  logger.info('Internal HTTP server started', { port: env.BOT_INTERNAL_PORT })

  // ---------------------------------------------------------------------------
  // Interaction handler (button clicks)
  // ---------------------------------------------------------------------------

  client.once(Events.ClientReady, () => {
    logger.info('Discord bot connected and ready', {
      tag: client.user?.tag,
    })

    // Padrão 13 do Akita: registra slash commands idempotentemente no ClientReady
    registerApplicationCommands(
      client,
      env.DISCORD_BOT_TOKEN,
      env.DISCORD_GUILD_ID,
    ).catch((err: unknown) => {
      logger.error('Unexpected error registering application commands', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    // ---------------------------------------------------------------------------
    // Slash commands (Padrão 13 do Akita)
    // ---------------------------------------------------------------------------
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'standup') return

      const sub = interaction.options.getSubcommand()
      const commandLogger = withContext(logger, {
        command: `standup ${sub}`,
        userId: interaction.user.id,
      })
      commandLogger.info('Received slash command')

      const commandDeps = {
        databaseUrl: env.DATABASE_URL,
        discordChannelId: env.DISCORD_CHANNEL_ID,
        handleInteraction: handleStandupInteraction,
      }

      if (sub === 'trigger') {
        await handleTrigger(interaction)
      } else if (sub === 'list') {
        await handleList(interaction, { databaseUrl: env.DATABASE_URL })
      } else if (sub === 'approve') {
        await handleApproveCommand(interaction, client, commandDeps)
      }

      return
    }

    // ---------------------------------------------------------------------------
    // Button interactions (review DM)
    // ---------------------------------------------------------------------------
    if (!interaction.isButton()) {
      return
    }

    const [namespace, action, standupId] = interaction.customId.split(':')
    if (namespace !== 'standup' || !standupId) {
      return
    }

    const interactionLogger = withContext(logger, {
      action,
      standupId,
      userId: interaction.user.id,
    })
    interactionLogger.info('Received standup action from button')

    // Defer update immediately to avoid Discord's 3s interaction timeout.
    // We'll edit the reply after async operations complete.
    await interaction.deferUpdate()

    const result = await handleStandupInteraction(
      action as StandupAction,
      standupId,
      {
        databaseUrl: env.DATABASE_URL,
        discordChannelId: env.DISCORD_CHANNEL_ID,
      },
      client,
    )

    if (result.status === 'ok') {
      interactionLogger.info('Standup interaction handled', {
        outcome: result.value.action,
      })
      // Padrão 2 do Akita: emoji de status como feedback visual imediato
      const emoji = (action ? STATUS_EMOJI[action] : undefined) ?? '\u{2139}' // ℹ️ fallback
      await interaction.editReply({
        content: `${emoji} ${result.value.message}`,
        components: [], // remove buttons after action
      })
    } else {
      interactionLogger.error('Standup interaction failed', {
        error: result.error.message,
      })
      await interaction.editReply({
        content: `\u{274C} Erro ao processar ação: ${result.error.message}`,
        components: [],
      })
    }
  })

  // Connect — aguarda ClientReady antes de resolver
  await new Promise<void>((resolve, reject) => {
    client.once(Events.ClientReady, () => resolve())
    client.once(Events.Error, reject)
    client.login(env.DISCORD_BOT_TOKEN).catch(reject)
  })
}

if (import.meta.main) {
  startDiscordBot().catch((error: unknown) => {
    const logger = createServiceLogger({
      service: 'discord-bot',
      component: 'startup',
    })
    logger.error('Discord bot startup failed', { error })
    process.exit(1)
  })
}
