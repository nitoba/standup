import type { BotEnv } from '@standup/config'
import { createServiceLogger, withContext } from '@standup/logger'
import {
  ActionRowBuilder,
  type ButtonInteraction,
  type Client,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type { CopyAction } from './copy-handler.js'
import { handleCopyButtonInteraction } from './copy-handler.js'
import type { StandupAction } from './interaction-handler.js'
import { handleStandupInteraction } from './interaction-handler.js'
import type { ReminderAction } from './reminder-handler.js'
import { handleReminderInteraction } from './reminder-handler.js'
import type { TriggerAction } from './trigger-handler.js'
import { handleTriggerButtonInteraction } from './trigger-handler.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'button-handler',
})

// Padrão 2 do Akita: emojis de status como feedback visual instantâneo
const STATUS_EMOJI: Record<string, string> = {
  approve: '\u{2705}', // checkmark
  reject: '\u{274C}', // red X
  regenerate: '\u{1F504}', // refresh arrows
}

/**
 * Builds and shows the regenerate modal with a text input for extra context.
 * Must be the immediate response to the interaction (within 3s).
 *
 * Uses ActionRowBuilder + TextInputBuilder for modal compatibility
 * with discord.js validation/runtime.
 */
async function showRegenerateModal(
  interaction: ButtonInteraction,
  standupId: string,
): Promise<void> {
  const textInput = new TextInputBuilder()
    .setCustomId('regenerate-context')
    .setLabel('O que deseja alterar?')
    .setPlaceholder(
      'Ex: Focar mais nas correcoes do card #1234, remover detalhes do repo X...',
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput)

  const modal = new ModalBuilder()
    .setCustomId(`standup-regenerate-modal:${standupId}`)
    .setTitle('Regenerar Standup')
    .addComponents(row)

  await interaction.showModal(modal)
}

/**
 * Handles button interactions from standup review DMs.
 * Parses the customId (standup:<action>:<standupId>).
 *
 * For "regenerate": shows a modal to collect extra context (no deferUpdate).
 * For "approve"/"reject": defers the update and delegates to handleStandupInteraction.
 */
export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  client: Client,
  env: Pick<
    BotEnv,
    | 'DATABASE_URL'
    | 'DISCORD_CHANNEL_ID'
    | 'WORKER_INTERNAL_URL'
    | 'API_BASE_URL'
    | 'INTERNAL_SECRET'
    | 'DISCORD_USER_ID'
  >,
): Promise<void> {
  const [namespace, action, standupId] = interaction.customId.split(':')

  // Route standup-reminder:* to the reminder handler
  if (namespace === 'standup-reminder') {
    const reminderAction = action as ReminderAction
    await handleReminderInteraction(interaction, reminderAction, {
      workerInternalUrl: env.WORKER_INTERNAL_URL,
      apiBaseUrl: env.API_BASE_URL,
      internalSecret: env.INTERNAL_SECRET,
      discordUserId: env.DISCORD_USER_ID,
    })
    return
  }

  // Route standup-trigger:* to the trigger confirmation handler
  if (namespace === 'standup-trigger') {
    if (!standupId) return
    const triggerAction = action as TriggerAction
    await handleTriggerButtonInteraction(
      interaction,
      triggerAction,
      standupId,
      { apiBaseUrl: env.API_BASE_URL },
    )
    return
  }

  // Route standup-copy:* to copy handler (ephemeral plain-text response)
  if (namespace === 'standup-copy') {
    if (!standupId) return
    const copyAction = action as CopyAction
    await handleCopyButtonInteraction(interaction, copyAction, standupId, {
      databaseUrl: env.DATABASE_URL,
    })
    return
  }

  if (namespace !== 'standup' || !standupId) return

  const interactionLogger = withContext(logger, {
    action,
    standupId,
    userId: interaction.user.id,
  })
  interactionLogger.info('Received standup action from button')

  // Regenerate: show modal instead of processing immediately.
  // showModal must be the immediate response (no deferUpdate before it).
  if (action === 'regenerate') {
    await showRegenerateModal(interaction, standupId)
    return
  }

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
    const emoji = (action ? STATUS_EMOJI[action] : undefined) ?? '\u{2139}' // fallback
    await interaction.editReply({
      content: `${emoji} ${result.value.message}`,
      components: [], // remove buttons after action
    })
  } else {
    interactionLogger.error('Standup interaction failed', {
      error: result.error.message,
    })
    await interaction.editReply({
      content: `\u{274C} Erro ao processar acao: ${result.error.message}`,
      components: [],
    })
  }
}
