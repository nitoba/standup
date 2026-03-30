import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { TriggerAcceptedDto } from '../../../shared/openapi/response-dtos'
import { TriggerStandupDto } from './trigger-standup.dto'
import { TriggerStandupService } from './trigger-standup.service'

@ApiTags('standups')
@Controller('standups')
export class TriggerStandupController {
  constructor(private readonly triggerStandup: TriggerStandupService) {}

  @Post('trigger')
  @HttpCode(202)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'triggerStandup',
    summary: 'Dispara a geração manual de um standup',
  })
  @ApiBody({ type: TriggerStandupDto })
  @ApiAcceptedResponse({
    description: 'Standup aceito para processamento.',
    type: TriggerAcceptedDto,
  })
  trigger(
    @Session() session: AuthSession | null,
    @Body() body: TriggerStandupDto,
  ) {
    requireSessionUserId(session)

    return this.triggerStandup.trigger(body, session)
  }
}
