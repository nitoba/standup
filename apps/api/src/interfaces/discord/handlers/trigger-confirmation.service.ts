import { Injectable } from '@nestjs/common'
import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  MessageFlags,
} from 'discord.js'
import { AppLoggerFactory } from '../../../platform/logger'
import { DiscordAuthService } from '../services/discord-auth.service'
import { DiscordTriggerService } from '../services/discord-trigger.service'
import {
  consumePendingTriggerRequest,
  createPendingTriggerRequest,
  type TriggerRequestOptions,
} from './trigger-request-store'

type TriggerAction = 'confirm' | 'cancel'

function ephemeral(content: string): InteractionReplyOptions {
  return { content, flags: MessageFlags.Ephemeral }
}

@Injectable()
export class TriggerConfirmationService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly auth: DiscordAuthService,
    private readonly trigger: DiscordTriggerService,
  ) {
    this.logger = this.loggerFactory.create('discord-trigger-confirmation')
  }

  async handleSlashCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const forceRegenerate =
      interaction.options.getBoolean('force-regenerate') ?? false
    const extraContext =
      interaction.options.getString('extra-context') ?? undefined

    const request = createPendingTriggerRequest(interaction.user.id, {
      forceRegenerate,
      extraContext,
    })

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`standup-trigger:confirm:${request.id}`)
        .setLabel('Confirmar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`standup-trigger:cancel:${request.id}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    )

    const details = [
      `- force-regenerate: ${forceRegenerate ? 'true' : 'false'}`,
      `- extra-context: ${extraContext ? 'informado' : 'vazio'}`,
    ].join('\n')

    await interaction.reply({
      ...ephemeral(
        `Confirme a geração manual do standup:\n${details}\n\nEsta confirmação expira em 5 minutos.`,
      ),
      components: [row],
    })
  }

  async handleButton(
    interaction: ButtonInteraction,
    action: TriggerAction,
    requestId: string,
  ): Promise<void> {
    await interaction.deferUpdate()

    const pendingRequest = consumePendingTriggerRequest(requestId)
    if (!pendingRequest) {
      await interaction.editReply({
        content:
          '⌛ Esta confirmação expirou. Rode `/standup trigger` novamente.',
        components: [],
      })
      return
    }

    if (pendingRequest.discordUserId !== interaction.user.id) {
      await interaction.editReply({
        content: '❌ Esta confirmação pertence a outro usuário.',
        components: [],
      })
      return
    }

    if (action === 'cancel') {
      await interaction.editReply({
        content: '❌ Operação cancelada.',
        components: [],
      })
      return
    }

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction)
      return
    }

    await interaction.editReply({
      content: '⏳ Processando trigger manual...',
      components: [],
    })

    const result = await this.trigger.trigger(
      session.userId,
      interaction.user.id,
      pendingRequest.options as TriggerRequestOptions,
    )
    if (result.isErr()) {
      this.logger.error('Failed to execute manual trigger', {
        userId: interaction.user.id,
        error: result.error.message,
      })
      await interaction.editReply({
        content: `❌ Falha ao disparar o standup agora.\n\nDetalhe: ${result.error.message}`,
        components: [],
      })
      return
    }

    if (!result.value.accepted) {
      await interaction.editReply({
        content:
          result.value.reason === 'pending_review_exists'
            ? '⚠️ Já existe um standup aguardando revisão.'
            : '✅ O standup de hoje já foi aprovado.',
        components: [],
      })
      return
    }

    await interaction.editReply({
      content:
        '✅ Trigger manual enviado com sucesso. Você receberá uma DM quando o standup estiver pronto.',
      components: [],
    })
  }
}
