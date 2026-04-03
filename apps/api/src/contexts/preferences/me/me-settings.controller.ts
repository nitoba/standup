import { Body, Controller, Get, Put } from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { MeSettingsResponseDto } from '../../../shared/openapi/response-dtos'
import { PutMeSettingsDto } from './me-settings.dto'
import { MeSettingsService } from './me-settings.service'

@ApiTags('settings')
@Controller('settings')
export class MeSettingsController {
  constructor(private readonly meSettingsService: MeSettingsService) {}

  @Get('me')
  @ApiOperation({
    operationId: 'getMeSettings',
    summary: 'Consulta as configurações do usuário autenticado',
  })
  @ApiOkResponse({
    description: 'Configurações atuais do usuário.',
    type: MeSettingsResponseDto,
  })
  async getMe(@Session() session: AuthSession | null) {
    const userId = requireSessionUserId(session)

    return { data: await this.meSettingsService.get(userId) }
  }

  @Put('me')
  @ApiOperation({
    operationId: 'updateMeSettings',
    summary: 'Atualiza as configurações do usuário autenticado',
  })
  @ApiBody({ type: PutMeSettingsDto })
  @ApiOkResponse({
    description: 'Configurações atualizadas.',
    type: MeSettingsResponseDto,
  })
  async putMe(
    @Session() session: AuthSession | null,
    @Body() body: PutMeSettingsDto,
  ) {
    const userId = requireSessionUserId(session)

    return { data: await this.meSettingsService.put(userId, body) }
  }
}
