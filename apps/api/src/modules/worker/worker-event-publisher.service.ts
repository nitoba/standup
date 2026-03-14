import { Injectable } from '@nestjs/common'
import { EventBusService } from '../events/event-bus.service'
import type {
  JobFailedNotificationEvent,
  StandupFailedEvent,
  StandupGeneratedEvent,
  StandupProgressEvent,
  StandupReadyEvent,
  StandupReminderEvent,
  UserDmRequestedEvent,
} from '../events/standup-events'

@Injectable()
export class WorkerEventPublisherService {
  constructor(private readonly eventBus: EventBusService) {}

  emitStandupProgress(payload: StandupProgressEvent): void {
    this.eventBus.emitStandupProgress(payload)
  }

  emitStandupGenerated(payload: StandupGeneratedEvent): void {
    this.eventBus.emitStandupGenerated(payload)
  }

  emitStandupFailed(payload: StandupFailedEvent): void {
    this.eventBus.emitStandupFailed(payload)
  }

  notifyStandupReady(payload: StandupReadyEvent): void {
    this.eventBus.emitStandupReady(payload)
  }

  notifyStandupReminder(payload: StandupReminderEvent): void {
    this.eventBus.emitStandupReminder(payload)
  }

  notifyUserDm(payload: UserDmRequestedEvent): void {
    this.eventBus.emitUserDmRequested(payload)
  }

  notifyJobFailed(payload: JobFailedNotificationEvent): void {
    this.eventBus.emitJobFailedNotification(payload)
  }
}
