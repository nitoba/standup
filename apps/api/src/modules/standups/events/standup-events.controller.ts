import {
  Controller,
  type MessageEvent,
  Sse,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { Observable } from 'rxjs'
import { StandupSseBusService } from './standup-sse-bus.service'

type AuthSession = {
  user: {
    id: string
  }
}

@ApiTags('standups')
@Controller('standups')
export class StandupEventsController {
  constructor(private readonly standupSseBus: StandupSseBusService) {}

  @Sse('events')
  @ApiOperation({ summary: 'Abre o stream SSE de eventos de standup' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Stream SSE aberto com sucesso.' })
  stream(@Session() session: AuthSession | null): Observable<MessageEvent> {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return this.standupSseBus.subscribe(userId)
  }
}
