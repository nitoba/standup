import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { TriggerStandupDto } from './trigger-standup.dto'
import { TriggerStandupService } from './trigger-standup.service'

type AuthSession = {
  user: {
    id: string
  }
}

@Controller('standups')
export class TriggerStandupController {
  constructor(private readonly triggerStandup: TriggerStandupService) {}

  @Post('trigger')
  @HttpCode(202)
  trigger(
    @Session() session: AuthSession | null,
    @Body() body: TriggerStandupDto,
  ) {
    return this.triggerStandup.trigger(body, session)
  }
}
