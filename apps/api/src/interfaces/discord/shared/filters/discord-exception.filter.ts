import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Injectable,
} from '@nestjs/common'
import type { Interaction, RepliableInteraction } from 'discord.js'
import { NecordArgumentsHost } from 'necord'
import { AppLoggerFactory } from '../../../../platform/logger'
import { TaggedError } from '../../../../shared/domain'

@Catch()
@Injectable()
export class DiscordExceptionFilter implements ExceptionFilter {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(loggerFactory: AppLoggerFactory) {
    this.logger = loggerFactory.create('discord-exception-filter')
  }

  async catch(err: unknown, host: ArgumentsHost): Promise<void> {
    const [maybeInteraction] =
      NecordArgumentsHost.create(host).getContext<'interactionCreate'>()
    const interaction = maybeInteraction as Interaction | undefined

    if (!TaggedError.is(err)) return

    this.logger.error('Discord handler failed', {
      tag: err._tag,
      message: err.message,
    })

    if (!interaction || typeof interaction.isRepliable !== 'function') return
    if (!interaction.isRepliable()) return

    const repliable = interaction as RepliableInteraction
    const payload = {
      content: `Erro: ${err.message}`,
      ephemeral: true,
    } as const
    if (repliable.deferred || repliable.replied) {
      await repliable.followUp(payload).catch((replyErr: unknown) => {
        this.logger.warn(
          'Failed to send ephemeral reply to Discord interaction',
          {
            error:
              replyErr instanceof Error ? replyErr.message : String(replyErr),
          },
        )
      })
    } else {
      await repliable.reply(payload).catch((replyErr: unknown) => {
        this.logger.warn(
          'Failed to send ephemeral reply to Discord interaction',
          {
            error:
              replyErr instanceof Error ? replyErr.message : String(replyErr),
          },
        )
      })
    }
  }
}
