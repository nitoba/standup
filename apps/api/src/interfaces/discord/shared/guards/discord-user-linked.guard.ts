// apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common'
import type { ChatInputCommandInteraction } from 'discord.js'
import { NecordExecutionContext } from 'necord'
import { DiscordAuthService } from '../../services/discord-auth.service'

@Injectable()
export class DiscordUserLinkedGuard implements CanActivate {
  constructor(private readonly auth: DiscordAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const [maybeInteraction] = NecordExecutionContext.create(
      context,
    ).getContext<'interactionCreate'>()
    const interaction = maybeInteraction as
      | ChatInputCommandInteraction
      | undefined
    if (!interaction || !('commandName' in interaction)) return false

    const session = await this.auth.requireChatAuth(interaction)
    return session !== null
  }
}
