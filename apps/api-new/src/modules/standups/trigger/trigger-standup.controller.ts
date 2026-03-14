import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import type { TriggerStandupDto } from './trigger-standup.dto'
import { TriggerStandupService } from './trigger-standup.service'

@Controller('standups')
export class TriggerStandupController {
  constructor(private readonly triggerStandup: TriggerStandupService) {}

  @Post('trigger')
  @HttpCode(202)
  trigger(
    @Session() session: AuthSession | null,
    @Body() body: TriggerStandupDto,
  ) {
    requireSessionUserId(session)

    return this.triggerStandup.trigger(body, session)
  }
}
