import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type {
  DiscordLoginSuccessRequestedEvent,
  JobFailedNotificationEvent,
  StandupFailedEvent,
  StandupGeneratedEvent,
  StandupProgressEvent,
  StandupReadyEvent,
  StandupReminderEvent,
  StandupStatusChangedEvent,
  UserDmRequestedEvent,
} from './standup-events'
import {
  DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT,
  JOB_FAILED_NOTIFICATION_EVENT,
  STANDUP_FAILED_EVENT,
  STANDUP_GENERATED_EVENT,
  STANDUP_PROGRESS_EVENT,
  STANDUP_READY_EVENT,
  STANDUP_REMINDER_EVENT,
  STANDUP_STATUS_CHANGED_EVENT,
  USER_DM_REQUESTED_EVENT,
} from './standup-events'

@Injectable()
export class EventBusService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emitStandupProgress(payload: StandupProgressEvent): void {
    this.eventEmitter.emit(STANDUP_PROGRESS_EVENT, payload)
  }

  emitStandupGenerated(payload: StandupGeneratedEvent): void {
    this.eventEmitter.emit(STANDUP_GENERATED_EVENT, payload)
  }

  emitStandupFailed(payload: StandupFailedEvent): void {
    this.eventEmitter.emit(STANDUP_FAILED_EVENT, payload)
  }

  emitStandupReady(payload: StandupReadyEvent): void {
    this.eventEmitter.emit(STANDUP_READY_EVENT, payload)
  }

  emitStandupReminder(payload: StandupReminderEvent): void {
    this.eventEmitter.emit(STANDUP_REMINDER_EVENT, payload)
  }

  emitStandupStatusChanged(payload: StandupStatusChangedEvent): void {
    this.eventEmitter.emit(STANDUP_STATUS_CHANGED_EVENT, payload)
  }

  requestDiscordLoginSuccess(payload: DiscordLoginSuccessRequestedEvent): void {
    this.eventEmitter.emit(DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT, payload)
  }

  emitUserDmRequested(payload: UserDmRequestedEvent): void {
    this.eventEmitter.emit(USER_DM_REQUESTED_EVENT, payload)
  }

  emitJobFailedNotification(payload: JobFailedNotificationEvent): void {
    this.eventEmitter.emit(JOB_FAILED_NOTIFICATION_EVENT, payload)
  }
}
