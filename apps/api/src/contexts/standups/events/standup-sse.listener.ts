import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_FAILED_EVENT,
  STANDUP_GENERATED_EVENT,
  STANDUP_PROGRESS_EVENT,
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupFailedEvent,
  type StandupGeneratedEvent,
  type StandupProgressEvent,
  type StandupStatusChangedEvent,
} from '../../../platform/events/standup-events'
import { StandupSseBusService } from './standup-sse-bus.service'

@Injectable()
export class StandupSseListener {
  constructor(private readonly standupSseBus: StandupSseBusService) {}

  @OnEvent(STANDUP_PROGRESS_EVENT)
  handleProgress(event: StandupProgressEvent): void {
    this.standupSseBus.emit(event.userId, {
      type: 'standup_progress',
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      step: event.step,
      message: event.message,
      standupId: event.standupId,
    })
  }

  @OnEvent(STANDUP_GENERATED_EVENT)
  handleGenerated(event: StandupGeneratedEvent): void {
    this.standupSseBus.emit(event.userId, {
      type: 'standup_generated',
      runId: event.runId,
      standupId: event.standupId,
      date: event.date,
      mode: event.mode,
    })
  }

  @OnEvent(STANDUP_FAILED_EVENT)
  handleFailed(event: StandupFailedEvent): void {
    this.standupSseBus.emit(event.userId, {
      type: 'standup_failed',
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      message: event.message,
    })
  }

  @OnEvent(STANDUP_STATUS_CHANGED_EVENT)
  handleStatusChanged(event: StandupStatusChangedEvent): void {
    this.standupSseBus.emit(event.userId, {
      type: 'standup_status_changed',
      standupId: event.standupId,
      newStatus: event.newStatus,
    })
  }
}
