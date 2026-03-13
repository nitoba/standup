import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common'
import type { ApproveStandupDto } from './dto/approve-standup.dto'
import type { TriggerStandupDto } from './dto/trigger-standup.dto'
import { StandupsService } from './standups.service'

@Controller('standups')
export class StandupsController {
  constructor(private readonly standupsService: StandupsService) {}

  @Post('trigger')
  @HttpCode(202)
  trigger(@Body() body: TriggerStandupDto) {
    return this.standupsService.trigger(body)
  }

  @Post(':id/approve')
  approve(@Param('id') standupId: string, @Body() body: ApproveStandupDto) {
    return this.standupsService.requestApproval(standupId, body)
  }
}
