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
import { notifyStandupStatusEvent } from '../../http/notify/standup-status-event.js'
import type { CopyAction } from './copy-handler.js'
import { handleCopyButtonInteraction } from './copy-handler.js'
import type { StandupAction } from './interaction-handler.js'
import { handleStandupInteraction } from './interaction-handler.js'
import type { ReminderAction } from './reminder-handler.js'
import { handleReminderInteraction } from './reminder-handler.js'
import { handleSettingsButton } from './settings-button-handler.js'
import type { TriggerAction } from './trigger-handler.js'
import { handleTriggerButtonInteraction } from './trigger-handler.js'
import { updateReviewMessage } from './update-review-message.js'

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

const PROCESSING_MESSAGE: Record<string, string> = {
  reject: '⏳ Rejeitando standup...',
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
    .setLabel('Contexto adicional (opcional)')
    .setPlaceholder(
      'Ex: Foque mais nos cards de maior impacto e reduza detalhes tecnicos...',
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

async function showAdjustModal(
  interaction: ButtonInteraction,
  standupId: string,
): Promise<void> {
  const textInput = new TextInputBuilder()
    .setCustomId('adjust-instruction')
    .setLabel('Quais alterações você quer no texto?')
    .setPlaceholder(
      'Ex: Remover item X, adicionar item Y, deixar mais objetivo e destacar correcoes.',
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput)

  const modal = new ModalBuilder()
    .setCustomId(`standup-adjust-modal:${standupId}`)
    .setTitle('Ajustar Standup Atual')
    .addComponents(row)

  await interaction.showModal(modal)
}

/**
 * Builds and shows the approve modal with optional fields for custom entries
 * (extra scheduled meetings and direct calls).
 * Must be the immediate response to the interaction (within 3s).
 */
async function showApproveModal(
  interaction: ButtonInteraction,
  standupId: string,
): Promise<void> {
  const meetingsInput = new TextInputBuilder()
    .setCustomId('scheduled-meetings')
    .setLabel('Reuniões extras (cada linha = 1 reunião)')
    .setPlaceholder('Planning Backend\nRefinamento mobile\nSync com time X')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)

  const callsInput = new TextInputBuilder()
    .setCustomId('direct-calls')
    .setLabel('Calls diretas (cada linha = 1 call)')
    .setPlaceholder(
      'Call com Joao sobre deploy\nSync com time de QA\nPareamento com Maria',
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)

  const meetingsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    meetingsInput,
  )
  const callsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    callsInput,
  )

  const modal = new ModalBuilder()
    .setCustomId(`standup-approve-modal:${standupId}`)
    .setTitle('Aprovar Standup')
    .addComponents(meetingsRow, callsRow)

  await interaction.showModal(modal)
}

/**
 * Handles button interactions from standup review DMs.
 * Parses the customId (standup:<action>:<standupId>).
 *
 * For "regenerate"/"adjust": shows a modal (no deferUpdate).
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
    | 'API_INTERNAL_URL'
    | 'INTERNAL_SECRET'
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
      discordUserId: interaction.user.id,
      databaseUrl: env.DATABASE_URL,
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
      {
        apiBaseUrl: env.API_BASE_URL,
        internalSecret: env.INTERNAL_SECRET,
        databaseUrl: env.DATABASE_URL,
      },
    )
    return
  }

  // Route settings:* to settings button handler
  if (namespace === 'settings' && action) {
    await handleSettingsButton(interaction, action, {
      databaseUrl: env.DATABASE_URL,
      workerInternalUrl: env.WORKER_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
    })
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
  if (!action) return

  const interactionLogger = withContext(logger, {
    action,
    standupId,
    userId: interaction.user.id,
  })
  interactionLogger.info('Received standup action from button')

  // Regenerate/Adjust: show modal instead of processing immediately.
  // showModal must be the immediate response (no deferUpdate before it).
  if (action === 'adjust') {
    await showAdjustModal(interaction, standupId)
    return
  }

  if (action === 'regenerate') {
    await showRegenerateModal(interaction, standupId)
    return
  }

  // Approve: show modal for optional custom entries (meetings/calls).
  // showModal must be the immediate response (no deferUpdate before it).
  if (action === 'approve') {
    await showApproveModal(interaction, standupId)
    return
  }

  // Remaining actions (reject): defer update and process immediately.
  await interaction.deferUpdate()
  await updateReviewMessage(interaction, {
    content:
      PROCESSING_MESSAGE[action] ??
      '⏳ Processando ação solicitada no standup...',
    components: [],
  })

  const result = await handleStandupInteraction(
    action as StandupAction,
    standupId,
    {
      actorDiscordId: interaction.user.id,
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
    await updateReviewMessage(interaction, {
      content: `${emoji} ${result.value.message}`,
      components: [], // remove buttons after action
    })
    // Notify API so SSE pushes standup_status_changed to the web client (fire-and-forget)
    void notifyStandupStatusEvent({
      apiInternalUrl: env.API_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
      userId: result.value.userId,
      standupId: result.value.standupId,
      newStatus: result.value.newStatus,
    })
  } else {
    interactionLogger.error('Standup interaction failed', {
      error: result.error.message,
    })
    await updateReviewMessage(interaction, {
      content: `\u{274C} Erro ao processar ação: ${result.error.message}`,
      components: [],
    })
  }
}
