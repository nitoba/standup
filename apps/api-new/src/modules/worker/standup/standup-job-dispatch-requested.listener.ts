import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_JOB_DISPATCH_REQUESTED_EVENT,
  type StandupJobDispatchRequestedEvent,
} from '../../events/standup-events'
import { StandupDispatchService } from './standup-dispatch.service'

@Injectable()
export class StandupJobDispatchRequestedListener {
  constructor(private readonly standupDispatch: StandupDispatchService) {}

  @OnEvent(STANDUP_JOB_DISPATCH_REQUESTED_EVENT)
  async handle(event: StandupJobDispatchRequestedEvent): Promise<{ ok: true }> {
    this.standupDispatch.dispatchStandupJob(event)
    return { ok: true }
  }
}
