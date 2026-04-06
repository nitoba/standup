import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { RetryDmService } from './retry-dm.service'

@ApiTags('standups')
@Controller('standups')
export class RetryDmController {
  constructor(
    private readonly retryDm: RetryDmService,
    private readonly userRepo: UserRepository,
  ) {}

  @Post(':id/retry-dm')
  @ApiOperation({ summary: 'Reenviar DM de revisao pendente' })
  @ApiResponse({ status: 200, description: 'DM reenviada com sucesso' })
  @ApiResponse({
    status: 400,
    description: 'Standup nao esta em estado pendente ou usuario sem Discord',
  })
  async retryDmDelivery(
    @Param('id') standupId: string,
    @Body() body: { userId: string },
  ) {
    const { userId } = body

    const discordResult = await this.userRepo.findDiscordIdByUserId(userId)
    if (discordResult.isErr() || !discordResult.value) {
      throw new BadRequestException('Usuario sem Discord vinculado')
    }

    const result = await this.retryDm.retryDm(
      standupId,
      userId,
      discordResult.value,
    )

    if (result.isErr()) {
      throw new BadRequestException(result.error.message)
    }

    return { ok: true, standupId, newStatus: result.value.newStatus }
  }
}
