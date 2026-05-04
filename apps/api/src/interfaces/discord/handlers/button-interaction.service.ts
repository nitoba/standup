import { Injectable } from '@nestjs/common'
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { updateReviewMessage } from '../features/review/update-review-message'
import {
  COPY_ACTIONS,
  type CopyAction,
  CopyInteractionService,
} from './copy-interaction.service'
import {
  REMINDER_ACTIONS,
  type ReminderAction,
  ReminderInteractionService,
} from './reminder-interaction.service'
import { SettingsInteractionService } from './settings-interaction.service'
import {
  STANDUP_ACTIONS,
  type StandupAction,
  StandupInteractionService,
} from './standup-interaction.service'
import { TriggerConfirmationService } from './trigger-confirmation.service'

const STATUS_EMOJI: Record<string, string> = {
  approve: '✅',
  reject: '❌',
  regenerate: '🔄',
}

const PROCESSING_MESSAGE: Record<string, string> = {
  reject: '⏳ Rejeitando standup...',
}

// Type guards that validate action values instead of blindly casting (TAS-70)
function isReminderAction(v: string): v is ReminderAction {
  return (REMINDER_ACTIONS as readonly string[]).includes(v)
}
function isTriggerAction(v: string): v is 'confirm' | 'cancel' {
  return v === 'confirm' || v === 'cancel'
}
function isSettingsAction(v: string): v is 'edit' | 'toggle' {
  return v === 'edit' || v === 'toggle'
}
function isCopyAction(v: string): v is CopyAction {
  return (COPY_ACTIONS as readonly string[]).includes(v)
}
function isStandupAction(v: string): v is StandupAction {
  return (STANDUP_ACTIONS as readonly string[]).includes(v)
}

@Injectable()
export class ButtonInteractionService {
  constructor(
    private readonly copy: CopyInteractionService,
    private readonly reminders: ReminderInteractionService,
    private readonly settings: SettingsInteractionService,
    private readonly standupInteraction: StandupInteractionService,
    private readonly trigger: TriggerConfirmationService,
  ) {}

  async handle(interaction: ButtonInteraction): Promise<void> {
    const [namespace, action, targetId] = interaction.customId.split(':')

    if (namespace === 'standup-reminder') {
      if (!action || !isReminderAction(action)) return
      await this.reminders.handle(interaction, action)
      return
    }

    if (namespace === 'standup-trigger' && targetId) {
      if (!action || !isTriggerAction(action)) return
      await this.trigger.handleButton(interaction, action, targetId)
      return
    }

    if (namespace === 'settings' && action) {
      if (!isSettingsAction(action)) return
      await this.settings.handleButton(interaction, action)
      return
    }

    if (namespace === 'standup-copy' && targetId) {
      if (!action || !isCopyAction(action)) return
      await this.copy.handle(interaction, action, targetId)
      return
    }

    if (namespace !== 'standup' || !action || !targetId) {
      return
    }

    if (action === 'adjust') {
      await this.showAdjustModal(interaction, targetId)
      return
    }

    if (action === 'regenerate') {
      await this.showRegenerateModal(interaction, targetId)
      return
    }

    if (action === 'approve') {
      await this.showApproveModal(interaction, targetId)
      return
    }

    await interaction.deferUpdate()
    await updateReviewMessage(interaction, {
      content:
        PROCESSING_MESSAGE[action] ??
        '⏳ Processando ação solicitada no standup...',
      components: [],
    })

    if (!isStandupAction(action)) return

    const result = await this.standupInteraction.handle(
      action,
      targetId,
      interaction.user.id,
    )

    if (result.isErr()) {
      await updateReviewMessage(interaction, {
        content: `❌ Erro ao processar ação: ${result.error.message}`,
        components: [],
      })
      return
    }

    await updateReviewMessage(interaction, {
      content: `${STATUS_EMOJI[action] ?? 'ℹ️'} ${result.value.message}`,
      components: [],
    })
  }

  private async showRegenerateModal(
    interaction: ButtonInteraction,
    standupId: string,
  ): Promise<void> {
    const textInput = new TextInputBuilder()
      .setCustomId('regenerate-context')
      .setLabel('Contexto adicional (opcional)')
      .setPlaceholder('Ex: foque mais nos cards de maior impacto...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000)

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      textInput,
    )
    const modal = new ModalBuilder()
      .setCustomId(`standup-regenerate-modal:${standupId}`)
      .setTitle('Regenerar Standup')
      .addComponents(row)

    await interaction.showModal(modal)
  }

  private async showAdjustModal(
    interaction: ButtonInteraction,
    standupId: string,
  ): Promise<void> {
    const textInput = new TextInputBuilder()
      .setCustomId('adjust-instruction')
      .setLabel('Quais alterações você quer no texto?')
      .setPlaceholder('Ex: remover item X, adicionar item Y...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      textInput,
    )
    const modal = new ModalBuilder()
      .setCustomId(`standup-adjust-modal:${standupId}`)
      .setTitle('Ajustar Standup Atual')
      .addComponents(row)

    await interaction.showModal(modal)
  }

  private async showApproveModal(
    interaction: ButtonInteraction,
    standupId: string,
  ): Promise<void> {
    const meetingsInput = new TextInputBuilder()
      .setCustomId('scheduled-meetings')
      .setLabel('Reuniões extras (cada linha = 1 reunião)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500)

    const callsInput = new TextInputBuilder()
      .setCustomId('direct-calls')
      .setLabel('Calls diretas (cada linha = 1 call)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500)

    const modal = new ModalBuilder()
      .setCustomId(`standup-approve-modal:${standupId}`)
      .setTitle('Aprovar Standup')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(meetingsInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(callsInput),
      )

    await interaction.showModal(modal)
  }
}
