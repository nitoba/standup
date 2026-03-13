import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_APPROVAL_REQUESTED_EVENT,
  STANDUP_TRIGGER_REQUESTED_EVENT,
  type StandupApprovalRequestedEvent,
  type StandupTriggerRequestedEvent,
} from '../events/standup-events'

@Injectable()
export class DiscordEventsListener {
  private readonly logger = new Logger(DiscordEventsListener.name)

  @OnEvent(STANDUP_TRIGGER_REQUESTED_EVENT)
  handleTriggerRequested(payload: StandupTriggerRequestedEvent): void {
    this.logger.log(
      `Evento ${STANDUP_TRIGGER_REQUESTED_EVENT} recebido para userId=${payload.userId}`,
    )
  }

  @OnEvent(STANDUP_APPROVAL_REQUESTED_EVENT)
  handleApprovalRequested(payload: StandupApprovalRequestedEvent): void {
    this.logger.log(
      `Evento ${STANDUP_APPROVAL_REQUESTED_EVENT} recebido para standupId=${payload.standupId}`,
    )
  }
}
