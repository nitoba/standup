import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Client, Events, GatewayIntentBits } from 'discord.js'
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
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Missing DISCORD_BOT_TOKEN')
  }

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

    // TODO Slice 5: implement real approve/reject/regenerate handlers
    await interaction.reply({
      content: `[${action}] recebido para standup ${standupId}.`,
      ephemeral: true,
    })
  })

  await new Promise<void>((resolve, reject) => {
    client.once(Events.ClientReady, () => resolve())
    client.once(Events.Error, reject)
    client.login(env.DISCORD_BOT_TOKEN as string).catch(reject)
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
