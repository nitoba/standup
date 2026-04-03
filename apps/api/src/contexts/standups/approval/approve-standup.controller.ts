import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { ApproveStandupResponseDto as ApproveResponseDtoType } from '../../../shared/openapi/response-dtos'
import { ApproveStandupDto } from './approve-standup.dto'
import { ApproveStandupService } from './approve-standup.service'

@ApiTags('standups')
@Controller('standups')
export class ApproveStandupController {
  constructor(private readonly approveStandup: ApproveStandupService) {}

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'approveStandup',
    summary: 'Aprova um standup pendente',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: ApproveStandupDto })
  @ApiOkResponse({
    description: 'Standup aprovado com sucesso.',
    type: ApproveResponseDtoType,
  })
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
