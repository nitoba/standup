import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { registerApplicationCommands } from './discord/commands/register.js'
import { handleButtonInteraction } from './discord/handlers/button-handler.js'
import { handleSlashCommand } from './discord/handlers/slash-command-handler.js'
import { createInternalRouter } from './http/router.js'

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

  // Single Discord Client for the entire process
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  // Internal HTTP server — worker → bot notifications
  // The same client is passed so send-review-dm reuses the existing connection.
  const internalApp = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    databaseUrl: env.DATABASE_URL,
    client,
    discordUserId: env.DISCORD_USER_ID,
    discordChannelId: env.DISCORD_CHANNEL_ID,
  })

  Bun.serve({ port: env.BOT_INTERNAL_PORT, fetch: internalApp.fetch })
  logger.info('Internal HTTP server started', { port: env.BOT_INTERNAL_PORT })

  client.once(Events.ClientReady, () => {
    logger.info('Discord bot connected and ready', { tag: client.user?.tag })

    // Register slash commands idempotently on every connect/reconnect (Padrão 13)
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
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, client, env)
      return
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction, client, env)
    }
  })

  // Wait for the gateway to be ready before resolving
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
