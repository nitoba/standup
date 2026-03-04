import type { AppEnv } from '@standup/config'
import { createServiceLogger, withContext } from '@standup/logger'
import type { ButtonInteraction, Client } from 'discord.js'
import type { StandupAction } from './interaction-handler.js'
import { handleStandupInteraction } from './interaction-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'button-handler',
})

// Padrão 2 do Akita: emojis de status como feedback visual instantâneo
const STATUS_EMOJI: Record<string, string> = {
  approve: '\u{2705}', // ✅ checkmark
  reject: '\u{274C}', // ❌ red X
  regenerate: '\u{1F504}', // 🔄 refresh arrows
}

/**
 * Handles button interactions from standup review DMs.
 * Parses the customId (standup:<action>:<standupId>), defers the update,
 * delegates to handleStandupInteraction, then edits the reply with result.
 */
export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
  env: Pick<AppEnv, 'DATABASE_URL' | 'DISCORD_CHANNEL_ID'>,
): Promise<void> {
  const [namespace, action, standupId] = interaction.customId.split(':')
  if (namespace !== 'standup' || !standupId) return

  const interactionLogger = withContext(logger, {
    action,
    standupId,
    userId: interaction.user.id,
  })
  interactionLogger.info('Received standup action from button')

  // Defer update immediately to avoid Discord's 3s interaction timeout.
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

  if (result.isOk()) {
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
}
