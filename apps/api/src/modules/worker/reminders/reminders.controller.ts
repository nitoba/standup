import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import { StandupDispatchService } from '../standup/standup-dispatch.service'
import { ReminderActionsService } from './reminder-actions.service'

type AuthSession = {
  user: {
    id: string
  }
}

@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly reminderActions: ReminderActionsService,
    private readonly standupDispatch: StandupDispatchService,
  ) {}

  @Post('snooze')
  @HttpCode(200)
  async snooze(@Session() session: AuthSession | null) {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return { data: await this.reminderActions.snoozeReminder(userId) }
  }

  @Post('cancel-today')
  @HttpCode(200)
  async cancelToday(@Session() session: AuthSession | null) {
    const userId = session?.user.id

    if (!userId) {
      throw new UnauthorizedException()
    }

    return { data: await this.reminderActions.cancelReminderForToday(userId) }
  }

  @Post('run-now')
  @HttpCode(202)
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
