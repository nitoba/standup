import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import { StandupDispatchService } from '../standup/standup-dispatch.service'
import { ReminderActionsService } from './reminder-actions.service'

type AuthSession = {
  user: {
    id: string
  }
}

@ApiTags('reminders')
@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly reminderActions: ReminderActionsService,
    private readonly standupDispatch: StandupDispatchService,
  ) {}

  @Post('snooze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Adia o lembrete do standup do dia' })
  @ApiOkResponse({ description: 'Lembrete adiado com sucesso.' })
  async snooze(@Session() session: AuthSession | null) {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return { data: await this.reminderActions.snoozeReminder(userId) }
  }

  @Post('cancel-today')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancela o lembrete do dia atual' })
  @ApiOkResponse({ description: 'Lembrete cancelado para o dia atual.' })
  async cancelToday(@Session() session: AuthSession | null) {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return { data: await this.reminderActions.cancelReminderForToday(userId) }
  }

  @Post('run-now')
  @HttpCode(202)
  @ApiOperation({ summary: 'Dispara imediatamente o job de standup' })
  @ApiAcceptedResponse({ description: 'Job aceito para processamento.' })
  async runNow(@Session() session: AuthSession | null) {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    const result = await this.standupDispatch.dispatchStandupJobForUser(userId)

    if (result.isErr()) {
      throw new BadRequestException(result.error.message)
    }

    return { ok: true, accepted: true }
  }
}
