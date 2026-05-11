// apps/api/src/interfaces/discord/features/approve/approve.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { MessageFlags } from 'discord.js'
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { ReviewActionService } from '../review/review-action.service'
import { ApproveDto } from './approve.dto'

@Injectable()
@StandupCommandGroup()
export class ApproveSubcommand {
  constructor(private readonly reviewActions: ReviewActionService) {}

  @Subcommand({
    name: 'approve',
    description: 'Aprovar um standup pelo ID',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onApprove(
    @Context() [interaction]: SlashCommandContext,
    @Options() { id }: ApproveDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const result = await this.reviewActions.handle(
      'approve',
      id,
      interaction.user.id,
    )

    if (result.isErr()) {
      await interaction.editReply(`❌ Erro ao aprovar: ${result.error.message}`)
      return
    }

    await interaction.editReply(`✅ ${result.value.message}`)
  }
}
