import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type {
  StandupApprovalRequestedEvent,
  StandupTriggerRequestedEvent,
} from './standup-events'
import {
  STANDUP_APPROVAL_REQUESTED_EVENT,
  STANDUP_TRIGGER_REQUESTED_EVENT,
} from './standup-events'

@Injectable()
export class EventBusService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emitStandupTriggerRequested(payload: StandupTriggerRequestedEvent): void {
    this.eventEmitter.emit(STANDUP_TRIGGER_REQUESTED_EVENT, payload)
  }

  emitStandupApprovalRequested(payload: StandupApprovalRequestedEvent): void {
    this.eventEmitter.emit(STANDUP_APPROVAL_REQUESTED_EVENT, payload)
  }
}
