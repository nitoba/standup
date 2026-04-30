// apps/api/src/interfaces/discord/features/auth/logout.command.ts
import { Injectable } from '@nestjs/common'
import { Context, SlashCommand, type SlashCommandContext } from 'necord'
import { DiscordAuthService } from '../../services/discord-auth.service'

@Injectable()
export class LogoutCommand {
  constructor(private readonly auth: DiscordAuthService) {}

  @SlashCommand({
    name: 'logout',
    description: 'Encerrar sua sessão no Standup Bot',
  })
  public async onLogout(@Context() [interaction]: SlashCommandContext) {
    await this.auth.handleLogoutCommand(interaction)
  }
}
