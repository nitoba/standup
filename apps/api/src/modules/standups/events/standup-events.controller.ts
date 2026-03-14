import {
  Controller,
  type MessageEvent,
  Sse,
  UnauthorizedException,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { Observable } from 'rxjs'
import { StandupSseBusService } from './standup-sse-bus.service'

type AuthSession = {
  user: {
    id: string
  }
}

@Controller('standups')
export class StandupEventsController {
  constructor(private readonly standupSseBus: StandupSseBusService) {}

  @Sse('events')
  stream(@Session() session: AuthSession | null): Observable<MessageEvent> {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return this.standupSseBus.subscribe(userId)
  }
}
