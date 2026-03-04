import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import type { StandupAction } from './discord/interaction-handler.js'
import { handleStandupInteraction } from './discord/interaction-handler.js'
import { createInternalRouter } from './http/internal-routes.js'

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
  // HTTP server for internal routes (worker → bot notifications)
  // ---------------------------------------------------------------------------

  const internalApp = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    databaseUrl: env.DATABASE_URL,
  })

  Bun.serve({
    port: env.BOT_INTERNAL_PORT,
    fetch: internalApp.fetch,
  })

  logger.info('Internal HTTP server started', { port: env.BOT_INTERNAL_PORT })

  // ---------------------------------------------------------------------------
  // Discord gateway
  // ---------------------------------------------------------------------------

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  client.once(Events.ClientReady, () => {
    logger.info('Discord bot connected and ready')
  })

  client.on(Events.InteractionCreate, async (interaction) => {
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
      await interaction.editReply({
        content: result.value.message,
        components: [], // remove buttons after action
      })
    } else {
      interactionLogger.error('Standup interaction failed', {
        error: result.error.message,
      })
      await interaction.editReply({
        content: `Erro ao processar ação: ${result.error.message}`,
        components: [],
      })
    }
  })

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
