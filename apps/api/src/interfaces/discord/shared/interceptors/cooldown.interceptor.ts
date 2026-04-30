import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { EMPTY, type Observable } from 'rxjs'
import { NecordExecutionContext } from 'necord'
import { CommandCooldownService } from '../../handlers/command-cooldown.service'

@Injectable()
export class CooldownInterceptor implements NestInterceptor {
  constructor(private readonly cooldown: CommandCooldownService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const [interaction] = NecordExecutionContext.create(context).getContext<'interactionCreate'>()
    if (!interaction || !('commandName' in interaction) || !('reply' in interaction)) {
      return next.handle()
    }

    const cmd = interaction as { user: { id: string }; commandName: string; reply: (opts: unknown) => Promise<unknown> }

    const remaining = this.cooldown.check(cmd.user.id, cmd.commandName)
    if (remaining !== null) {
      void cmd.reply({
        content: `Aguarde ${remaining}s antes de usar este comando novamente.`,
        ephemeral: true,
      })
      return EMPTY
    }

    this.cooldown.record(cmd.user.id, cmd.commandName)
    return next.handle()
  }
}
