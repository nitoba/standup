// apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.ts
import { Injectable, UseGuards, UseInterceptors } from '@nestjs/common'
import { Context, type SlashCommandContext, Subcommand } from 'necord'
import { TriggerConfirmationService } from '../../handlers/trigger-confirmation.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { CooldownInterceptor } from '../../shared/interceptors/cooldown.interceptor'

@Injectable()
@StandupCommandGroup()
export class TriggerSubcommand {
  constructor(private readonly trigger: TriggerConfirmationService) {}

  @Subcommand({
    name: 'trigger',
    description: 'Gerar standup agora',
  })
  @UseGuards(DiscordUserLinkedGuard)
  @UseInterceptors(CooldownInterceptor)
  public async onTrigger(@Context() [interaction]: SlashCommandContext) {
    await this.trigger.handleSlashCommand(interaction)
  }
}
