import { Body, Controller, Get, Put } from '@nestjs/common'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { PutMeSettingsDto } from './me-settings.dto'
import { MeSettingsService } from './me-settings.service'

@Controller('settings')
export class MeSettingsController {
  constructor(private readonly meSettingsService: MeSettingsService) {}

  @Get('me')
  async getMe(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    return { data: await this.meSettingsService.get(userId) }
  }

  @Put('me')
  async putMe(
    @Session() session: AuthSession | null,
    @Body() body: PutMeSettingsDto,
  ) {
    const userId = requireSessionUserId(session)

    return { data: await this.meSettingsService.put(userId, body) }
  }
}
