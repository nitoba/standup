// apps/api/src/interfaces/discord/features/list/list.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { MessageFlags } from 'discord.js'
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord'
import { StandupReadRepository } from '../../../../platform/database/repositories/standup-read.repository'
import type { StandupStatus } from '../../../../shared/domain'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { ListDto } from './list.dto'
import { buildListEmbeds } from './list.embed'

@Injectable()
@StandupCommandGroup()
export class ListSubcommand {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly repo: StandupReadRepository,
  ) {}

  @Subcommand({
    name: 'list',
    description: 'Listar últimos standups',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onList(
    @Context() [interaction]: SlashCommandContext,
    @Options() opts: ListDto,
  ) {
    const page = opts.page ?? 1
    const search = opts.search?.trim() || undefined
    const status = opts.status as StandupStatus | undefined

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    const result = await this.repo.list({
      userId: session?.hasSession ? session.userId : undefined,
      status,
      search,
      page,
      pageSize: 10,
    })

    if (result.isErr()) {
      await interaction.editReply(
        `❌ Erro ao buscar standups: ${result.error.message}`,
      )
      return
    }

    if (result.value.items.length === 0) {
      await interaction.editReply('📭 Nenhum standup encontrado.')
      return
    }

    await interaction.editReply({ embeds: buildListEmbeds(result.value) })
  }
}
