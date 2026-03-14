import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { StandupStatusService } from './standup-status.service'
import { UpdateStandupStatusDto } from './update-standup-status.dto'

@Controller('standups')
export class StandupStatusController {
  constructor(private readonly standupStatus: StandupStatusService) {}

  @Patch(':id/status')
  @HttpCode(200)
  async update(
    @Session() session: AuthSession | null,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateStandupStatusDto,
  ) {
    const userId = requireSessionUserId(session)

    return {
      data: await this.standupStatus.update(userId, id, body.status),
    }
  }
}
