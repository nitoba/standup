// apps/api/src/interfaces/discord/features/auth/login.command.ts
import { Injectable } from '@nestjs/common'
import { Context, SlashCommand, type SlashCommandContext } from 'necord'
import { DiscordAuthService } from '../../services/discord-auth.service'

@Injectable()
export class LoginCommand {
  constructor(private readonly auth: DiscordAuthService) {}

  @SlashCommand({
    name: 'login',
    description: 'Conectar sua conta Discord ao Standup Bot',
  })
  public async onLogin(@Context() [interaction]: SlashCommandContext) {
    await this.auth.handleLoginCommand(interaction)
  }
}
