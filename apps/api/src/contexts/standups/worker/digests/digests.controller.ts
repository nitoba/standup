import { Controller, HttpCode, Post } from '@nestjs/common'
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../../shared/auth/require-session-user-id'
import { TriggerAcceptedDto } from '../../../../shared/openapi/response-dtos'
import { WeeklyDigestDispatchService } from './weekly-digest-dispatch.service'

@ApiTags('digests')
@Controller('digests')
export class DigestsController {
  constructor(
    private readonly weeklyDigestDispatch: WeeklyDigestDispatchService,
  ) {}

  @Post('trigger')
  @HttpCode(202)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'triggerDigest',
    summary: 'Dispara a geração manual do digest semanal',
  })
  @ApiAcceptedResponse({
    description: 'Digest enfileirado para processamento.',
    type: TriggerAcceptedDto,
  })
  trigger(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    this.weeklyDigestDispatch.dispatchWeeklyDigestJob({ userId })

    return { ok: true, accepted: true }
  }
}
