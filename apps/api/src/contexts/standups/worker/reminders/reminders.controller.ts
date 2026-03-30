import { BadRequestException, Controller, HttpCode, Post } from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../../shared/auth/require-session-user-id'
import {
  CancelTodayReminderResponseDto,
  SnoozeReminderResponseDto,
  TriggerAcceptedDto,
} from '../../../../shared/openapi/response-dtos'
import { StandupDispatchService } from '../standup/standup-dispatch.service'
import { ReminderActionsService } from './reminder-actions.service'

@ApiTags('reminders')
@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly reminderActions: ReminderActionsService,
    private readonly standupDispatch: StandupDispatchService,
  ) {}

  @Post('snooze')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'snoozeReminder',
    summary: 'Adia o lembrete do standup do dia',
  })
  @ApiOkResponse({
    description: 'Lembrete adiado com sucesso.',
    type: SnoozeReminderResponseDto,
  })
  async snooze(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    return { data: await this.reminderActions.snoozeReminder(userId) }
  }

  @Post('cancel-today')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'cancelTodayReminder',
    summary: 'Cancela o lembrete do dia atual',
  })
  @ApiOkResponse({
    description: 'Lembrete cancelado para o dia atual.',
    type: CancelTodayReminderResponseDto,
  })
  async cancelToday(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    return { data: await this.reminderActions.cancelReminderForToday(userId) }
  }

  @Post('run-now')
  @HttpCode(202)
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'runReminderNow',
    summary: 'Dispara imediatamente o job de standup',
  })
  @ApiAcceptedResponse({
    description: 'Job aceito para processamento.',
    type: TriggerAcceptedDto,
  })
  async runNow(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    const result = await this.standupDispatch.dispatchStandupJobForUser(userId)

    if (result.isErr()) {
      throw new BadRequestException(result.error.message)
    }

    return { ok: true, accepted: true }
  }
}
