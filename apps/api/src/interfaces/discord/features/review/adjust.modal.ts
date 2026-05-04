// apps/api/src/interfaces/discord/features/review/adjust.modal.ts
import { Injectable } from '@nestjs/common'
import type { ModalSubmitInteraction } from 'discord.js'
import { ComponentParam, Context, Modal, type ModalContext } from 'necord'
import type { CustomEntries } from '../../../../shared/domain'
import { hasCustomEntries } from '../../../../shared/domain'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { DiscordTriggerService } from '../../services/discord-trigger.service'
import { ReviewActionService } from './review-action.service'
import { updateReviewMessage } from './update-review-message'

function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

@Injectable()
export class AdjustModal {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly trigger: DiscordTriggerService,
    private readonly reviewActions: ReviewActionService,
  ) {}

  @Modal('standup-approve-modal\\::standupId')
  public async onApprove(
    @Context() [interaction]: ModalContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.handleApproveModal(interaction, standupId)
  }

  @Modal('standup-adjust-modal\\::standupId')
  public async onSubmit(
    @Context() [interaction]: ModalContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.handleAdjustModal(interaction, standupId)
  }

  @Modal('standup-regenerate-modal\\::standupId')
  public async onRegenerate(
    @Context() [interaction]: ModalContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.handleRegenerateModal(interaction, standupId)
  }

  private async handleApproveModal(
    interaction: ModalSubmitInteraction,
    standupId: string,
  ): Promise<void> {
    await interaction.deferUpdate()
    await updateReviewMessage(interaction, {
      content: '⏳ Processando aprovação do standup...',
      components: [],
    })

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction)
      return
    }

    const entries: CustomEntries = {
      scheduledMeetings: parseLines(
        interaction.fields.getTextInputValue('scheduled-meetings')?.trim() ||
          '',
      ),
      directCalls: parseLines(
        interaction.fields.getTextInputValue('direct-calls')?.trim() || '',
      ),
    }

    const result = await this.reviewActions.handle(
      'approve',
      standupId,
      interaction.user.id,
      entries,
    )
    if (result.isErr()) {
      await updateReviewMessage(interaction, {
        content: `❌ Erro ao aprovar: ${result.error.message}`,
        components: [],
      })
      return
    }

    await updateReviewMessage(interaction, {
      content: `✅ ${result.value.message}${hasCustomEntries(entries) ? '\nEntradas adicionadas ao standup.' : ''}`,
      components: [],
    })
  }

  private async handleAdjustModal(
    interaction: ModalSubmitInteraction,
    standupId: string,
  ): Promise<void> {
    const rewriteInstruction =
      interaction.fields.getTextInputValue('adjust-instruction')?.trim() || ''

    await interaction.deferUpdate()
    await updateReviewMessage(interaction, {
      content:
        '⏳ Solicitação recebida. Estou preparando uma nova versão do standup...',
      components: [],
    })

    if (!rewriteInstruction) {
      await updateReviewMessage(interaction, {
        content: '❌ Informe as alterações desejadas para ajustar o standup.',
        components: [],
      })
      return
    }

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction)
      return
    }

    const triggerResult = await this.trigger.trigger(
      session.userId,
      interaction.user.id,
      {
        forceRegenerate: true,
        rewriteFromStandupId: standupId,
        rewriteInstruction,
        replaceStandupId: standupId,
      },
    )

    if (triggerResult.isErr()) {
      await updateReviewMessage(interaction, {
        content:
          '❌ Falha ao disparar ajuste do standup. Tente novamente em instantes.',
        components: [],
      })
      return
    }

    if (!triggerResult.value.accepted) {
      await updateReviewMessage(interaction, {
        content:
          triggerResult.value.reason === 'pending_review_exists'
            ? '❌ Já existe um standup pendente de revisão para hoje.'
            : '❌ O standup de hoje já foi aprovado ou publicado.',
        components: [],
      })
      return
    }

    await updateReviewMessage(interaction, {
      content:
        '🛠️ Ajuste solicitado com sucesso. Vou gerar uma nova versão baseada no texto anterior.',
      components: [],
    })
  }

  private async handleRegenerateModal(
    interaction: ModalSubmitInteraction,
    standupId: string,
  ): Promise<void> {
    const extraContext =
      interaction.fields.getTextInputValue('regenerate-context')?.trim() || ''

    await interaction.deferUpdate()
    await updateReviewMessage(interaction, {
      content:
        '⏳ Solicitação recebida. Estou rejeitando o standup atual e iniciando a regeneração do zero...',
      components: [],
    })

    const rejectResult = await this.reviewActions.handle(
      'regenerate',
      standupId,
      interaction.user.id,
    )
    if (rejectResult.isErr()) {
      await updateReviewMessage(interaction, {
        content: `❌ Erro ao rejeitar standup atual: ${rejectResult.error.message}`,
        components: [],
      })
      return
    }

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction)
      return
    }

    const triggerResult = await this.trigger.trigger(
      session.userId,
      interaction.user.id,
      {
        forceRegenerate: true,
        replaceStandupId: standupId,
        ...(extraContext ? { extraContext } : {}),
      },
    )

    if (triggerResult.isErr()) {
      await updateReviewMessage(interaction, {
        content:
          '❌ Standup rejeitado, mas falhou ao disparar regeneração. Use `/standup trigger` para tentar novamente.',
        components: [],
      })
      return
    }

    if (!triggerResult.value.accepted) {
      await updateReviewMessage(interaction, {
        content:
          triggerResult.value.reason === 'pending_review_exists'
            ? '❌ Standup rejeitado, mas já existe outro pendente de revisão para hoje.'
            : '❌ Standup rejeitado, mas o standup de hoje já foi aprovado ou publicado.',
        components: [],
      })
      return
    }

    await updateReviewMessage(interaction, {
      content: `🔄 Regenerando standup do zero...${extraContext ? `\nContexto: _${extraContext}_` : ''}\nVocê receberá uma nova DM quando estiver pronto.`,
      components: [],
    })
  }
}
