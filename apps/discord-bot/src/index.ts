import { initTracing } from '@standup/observability'

initTracing('standup-discord-bot')

import { loadBotEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { handleLogin } from './discord/commands/login.js'
import { handleLogout } from './discord/commands/logout.js'
import { registerApplicationCommands } from './discord/commands/register.js'
import { handleAdjustModal } from './discord/handlers/adjust-modal-handler.js'
import { handleApproveModal } from './discord/handlers/approve-modal-handler.js'
import { handleButtonInteraction } from './discord/handlers/button-handler.js'
import { handleRegenerateModal } from './discord/handlers/modal-handler.js'
import { handleSettingsModal } from './discord/handlers/settings-modal-handler.js'
import { handleSlashCommand } from './discord/handlers/slash-command-handler.js'
import { createInternalRouter } from './http/router.js'

export async function startDiscordBot(): Promise<void> {
  const logger = createServiceLogger({
    service: 'discord-bot',
    component: 'gateway',
  })

  const envResult = loadBotEnv()
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
    discordChannelId: env.DISCORD_CHANNEL_ID,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
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
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'login') {
          await handleLogin(interaction, {
            databaseUrl: env.DATABASE_URL,
            apiBaseUrl: env.API_BASE_URL,
          })
          return
        }
        if (interaction.commandName === 'logout') {
          await handleLogout(interaction, {
            databaseUrl: env.DATABASE_URL,
          })
          return
        }
        await handleSlashCommand(interaction, client, env)
        return
      }

      if (interaction.isButton()) {
        await handleButtonInteraction(interaction, client, env)
        return
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'settings-modal:edit') {
          await handleSettingsModal(interaction, {
            databaseUrl: env.DATABASE_URL,
          })
          return
        }
        if (interaction.customId.startsWith('standup-approve-modal:')) {
          await handleApproveModal(interaction, client, env)
          return
        }
        if (interaction.customId.startsWith('standup-adjust-modal:')) {
          await handleAdjustModal(interaction, client, env)
          return
        }
        await handleRegenerateModal(interaction, client, env)
      }
    } catch (error: unknown) {
      logger.error('Unhandled error in interaction handler', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        interactionType: interaction.type,
        interactionId: interaction.id,
      })
    }
  })

  // Permanent error listener — prevents unhandled rejections from crashing the process
  // after startup (e.g. reconnection failures, gateway errors).
  client.on(Events.Error, (error) => {
    logger.error('Discord client error', {
      error: error.message,
      stack: error.stack,
    })
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
    logger.error('Discord bot startup failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  })
}
