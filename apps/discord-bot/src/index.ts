import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
} from 'discord.js'

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

    await interaction.reply({
      content: `[${action}] recebido para standup ${standupId}.`,
      ephemeral: true,
    })
  })

  await client.login(env.DISCORD_BOT_TOKEN)

  if (env.DISCORD_USER_ID) {
    const user = await client.users.fetch(env.DISCORD_USER_ID)
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('standup:approve:preview')
        .setLabel('Aprovar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('standup:reject:preview')
        .setLabel('Rejeitar')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('standup:regenerate:preview')
        .setLabel('Regenerar')
        .setStyle(ButtonStyle.Secondary),
    )

    await user.send({
      content: 'Bot iniciado. Este e o preview dos botoes de revisao.',
      components: [controls],
    })
  }
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
