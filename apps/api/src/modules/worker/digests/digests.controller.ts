import { Controller, HttpCode, Post } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { WeeklyDigestDispatchService } from './weekly-digest-dispatch.service'

@Controller('digests')
export class DigestsController {
  constructor(
    private readonly weeklyDigestDispatch: WeeklyDigestDispatchService,
  ) {}

  @Post('trigger')
  @HttpCode(202)
  trigger(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    this.weeklyDigestDispatch.dispatchWeeklyDigestJob({ userId })

    return { ok: true, accepted: true }
  }
}
