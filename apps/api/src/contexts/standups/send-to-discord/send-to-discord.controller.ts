import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { StandupDetailResponseDto } from '../../../shared/openapi/response-dtos'
import { SendToDiscordService } from './send-to-discord.service'

@ApiTags('standups')
@Controller('standups')
export class SendToDiscordController {
  constructor(private readonly sendToDiscord: SendToDiscordService) {}

  @Post(':id/send-to-discord')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'sendToDiscord',
    summary: 'Envia standup aprovado para o Discord via automacao',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({
    description: 'Standup enviado com sucesso.',
    type: StandupDetailResponseDto,
  })
  async send(
    @Session() session: AuthSession | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = requireSessionUserId(session)

    return {
      data: await this.sendToDiscord.send(userId, id),
    }
  }
}
