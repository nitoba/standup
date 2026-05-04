// apps/api/src/interfaces/discord/features/review/review.buttons.ts
import { Injectable } from '@nestjs/common'
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { Button, type ButtonContext, ComponentParam, Context } from 'necord'
import { ReviewActionService } from './review-action.service'
import { updateReviewMessage } from './update-review-message'

const STATUS_EMOJI: Record<string, string> = {
  approve: '✅',
  reject: '❌',
  regenerate: '🔄',
}

@Injectable()
export class ReviewButtons {
  constructor(private readonly reviewActions: ReviewActionService) {}

  @Button('standup\\:approve\\::standupId')
  public async onApprove(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.showApproveModal(interaction, standupId)
  }

  @Button('standup\\:reject\\::standupId')
  public async onReject(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await interaction.deferUpdate()
    await updateReviewMessage(interaction, {
      content: '⏳ Rejeitando standup...',
      components: [],
    })

    const result = await this.reviewActions.handle(
      'reject',
      standupId,
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
      content: `${STATUS_EMOJI.reject} ${result.value.message}`,
      components: [],
    })
  }

  @Button('standup\\:adjust\\::standupId')
  public async onAdjust(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.showAdjustModal(interaction, standupId)
  }

  @Button('standup\\:regenerate\\::standupId')
  public async onRegenerate(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.showRegenerateModal(interaction, standupId)
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
