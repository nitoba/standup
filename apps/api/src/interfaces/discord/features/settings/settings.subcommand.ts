// apps/api/src/interfaces/discord/features/settings/settings.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { Context, type SlashCommandContext, Subcommand } from 'necord'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'

@Injectable()
@StandupCommandGroup()
export class SettingsSubcommand {
  constructor(private readonly settings: SettingsInteractionService) {}

  @Subcommand({
    name: 'settings',
    description: 'Ver ou alterar configurações de standup',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onSettings(@Context() [interaction]: SlashCommandContext) {
    await this.settings.handleCommand(interaction)
  }
}
