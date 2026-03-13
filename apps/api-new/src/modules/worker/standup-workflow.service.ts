import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_APPROVAL_REQUESTED_EVENT,
  STANDUP_TRIGGER_REQUESTED_EVENT,
  type StandupApprovalRequestedEvent,
  type StandupTriggerRequestedEvent,
} from '../events/standup-events'

@Injectable()
export class StandupWorkflowService {
  private readonly logger = new Logger(StandupWorkflowService.name)

  @OnEvent(STANDUP_TRIGGER_REQUESTED_EVENT)
  handleTriggerRequested(payload: StandupTriggerRequestedEvent): void {
    this.logger.log(
      `Fluxo de geracao solicitado para userId=${payload.userId} via ${payload.source}`,
    )
  }

  @OnEvent(STANDUP_APPROVAL_REQUESTED_EVENT)
  handleApprovalRequested(payload: StandupApprovalRequestedEvent): void {
    this.logger.log(
      `Fluxo de aprovacao solicitado para standupId=${payload.standupId} via ${payload.source}`,
    )
  }
}
