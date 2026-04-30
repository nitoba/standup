import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { ChatInputCommandInteraction } from 'discord.js'
import { EMPTY, type Observable } from 'rxjs'
import { CommandCooldownService } from '../../handlers/command-cooldown.service'

type Ctx = readonly [ChatInputCommandInteraction]

@Injectable()
export class CooldownInterceptor implements NestInterceptor {
  constructor(private readonly cooldown: CommandCooldownService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const args = context.getArgByIndex(0) as Ctx | undefined
    const interaction = args?.[0]
    if (!interaction || !('commandName' in interaction)) {
      return next.handle()
    }

    const remaining = this.cooldown.check(
      interaction.user.id,
      interaction.commandName,
    )
    if (remaining !== null) {
      void interaction.reply({
        content: `Aguarde ${remaining}s antes de usar este comando novamente.`,
        ephemeral: true,
      })
      return EMPTY
    }

    this.cooldown.record(interaction.user.id, interaction.commandName)
    return next.handle()
  }
}
