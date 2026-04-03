import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { StandupDetailResponseDto } from '../../../shared/openapi/response-dtos'
import { StandupStatusService } from './standup-status.service'
import { UpdateStandupStatusDto } from './update-standup-status.dto'

@ApiTags('standups')
@Controller('standups')
export class StandupStatusController {
  constructor(private readonly standupStatus: StandupStatusService) {}

  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'updateStandupStatus',
    summary: 'Atualiza o status de um standup',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: UpdateStandupStatusDto })
  @ApiOkResponse({
    description: 'Status atualizado com sucesso.',
    type: StandupDetailResponseDto,
  })
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
