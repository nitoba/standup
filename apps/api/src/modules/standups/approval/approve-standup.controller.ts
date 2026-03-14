import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { ApproveStandupDto } from './approve-standup.dto'
import { ApproveStandupService } from './approve-standup.service'

@Controller('standups')
export class ApproveStandupController {
  constructor(private readonly approveStandup: ApproveStandupService) {}

  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @Session() session: AuthSession | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveStandupDto,
  ) {
    const userId = requireSessionUserId(session)

    return {
      data: await this.approveStandup.approve(userId, id, body.customEntries),
    }
  }
}
