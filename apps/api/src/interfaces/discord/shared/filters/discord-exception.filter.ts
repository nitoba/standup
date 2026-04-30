import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Injectable,
} from '@nestjs/common'
import { NecordArgumentsHost } from 'necord'
import { AppLoggerFactory } from '../../../../platform/logger'
import { TaggedError } from '../../../../shared/domain'

type InteractionLike = {
  isRepliable: () => boolean
  deferred?: boolean
  replied?: boolean
  reply?: (payload: { content: string; ephemeral: true }) => Promise<unknown>
  followUp?: (payload: { content: string; ephemeral: true }) => Promise<unknown>
}

@Catch()
@Injectable()
export class DiscordExceptionFilter implements ExceptionFilter {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(loggerFactory: AppLoggerFactory) {
    this.logger = loggerFactory.create('discord-exception-filter')
  }

  async catch(err: unknown, host: ArgumentsHost): Promise<void> {
    const [maybeInteraction] = NecordArgumentsHost.create(host).getContext<'interactionCreate'>()
    const interaction = maybeInteraction as InteractionLike | undefined

    if (!TaggedError.is(err)) return

    this.logger.error('Discord handler failed', {
      tag: err._tag,
      message: err.message,
    })

    if (!interaction || typeof interaction.isRepliable !== 'function') return
    if (!interaction.isRepliable()) return

    const payload = { content: `Erro: ${err.message}`, ephemeral: true } as const
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp?.(payload).catch(() => undefined)
    } else {
      await interaction.reply?.(payload).catch(() => undefined)
    }
  }
}
