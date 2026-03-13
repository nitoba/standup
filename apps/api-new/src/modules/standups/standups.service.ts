import { Injectable } from '@nestjs/common'
import { EventBusService } from '../events/event-bus.service'
import type { ApproveStandupDto } from './dto/approve-standup.dto'
import type { TriggerStandupDto } from './dto/trigger-standup.dto'

@Injectable()
export class StandupsService {
  constructor(private readonly eventBus: EventBusService) {}

  trigger(body: TriggerStandupDto) {
    this.eventBus.emitStandupTriggerRequested({
      userId: body.userId,
      discordUserId: body.discordUserId,
      source: 'http',
    })

    return {
      accepted: true,
      source: 'http',
    }
  }

  requestApproval(standupId: string, body: ApproveStandupDto) {
    this.eventBus.emitStandupApprovalRequested({
      standupId,
      userId: body.userId,
      source: 'http',
    })

    return {
      accepted: true,
      standupId,
    }
  }
}
