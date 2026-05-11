// apps/api/src/interfaces/discord/features/retry/retry.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { MessageFlags } from 'discord.js'
import { Context, type SlashCommandContext, Subcommand } from 'necord'
import { RetryDmService } from '../../../../contexts/standups/delivery/retry-dm.service'
import { StandupReadRepository } from '../../../../platform/database/repositories/standup-read.repository'
import type { StandupStatus } from '../../../../shared/domain'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'

function standupStatusLabel(status: StandupStatus): string {
  const labels: Record<StandupStatus, string> = {
    draft: 'Rascunho',
    delivery_pending: 'Aguardando DM',
    pending_review: 'Pendente de Revisão',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
  }

  return labels[status]
}

@Injectable()
@StandupCommandGroup()
export class RetrySubcommand {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly standupRepository: StandupReadRepository,
    private readonly retryDm: RetryDmService,
  ) {}

  @Subcommand({
    name: 'retry',
    description: 'Reenviar DM de standup pendente',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onRetry(@Context() [interaction]: SlashCommandContext) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession || !session.userId) {
      await interaction.editReply(
        'Você precisa estar logado para usar este comando. Use `/login`.',
      )
      return
    }

    const todayParts = new Date().toISOString().split('T')
    const today = todayParts[0]
    if (!today) {
      await interaction.editReply('Erro ao obter data atual. Tente novamente.')
      return
    }

    const standupResult = await this.standupRepository.findLatestByUserAndDate(
      session.userId,
      today,
    )

    if (standupResult.isErr()) {
      await interaction.editReply(
        'Erro ao buscar standup do dia. Tente novamente.',
      )
      return
    }

    const standup = standupResult.value
    if (!standup) {
      await interaction.editReply(
        'Nenhum standup pendente de entrega encontrado para hoje.',
      )
      return
    }

    if (standup.status !== 'delivery_pending') {
      await interaction.editReply(
        `Seu standup está no estado "${standupStatusLabel(standup.status)}", não é possível reenviar a DM.`,
      )
      return
    }

    const retryResult = await this.retryDm.retryDm(
      standup.id,
      session.userId,
      interaction.user.id,
    )

    if (retryResult.isErr()) {
      await interaction.editReply(
        `❌ Erro ao reenviar DM: ${retryResult.error.message}`,
      )
      return
    }

    await interaction.editReply(
      '✅ DM reenviada com sucesso! Verifique sua caixa de mensagens directas.',
    )
  }
}
