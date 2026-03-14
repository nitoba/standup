import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { createServiceLogger } from '@standup/logger'
import {
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupStatusChangedEvent,
} from '../../events/standup-events'
import { StandupStatusSyncService } from '../services/standup-status-sync.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-standup-status-changed-listener',
})

@Injectable()
export class StandupStatusChangedListener {
  constructor(private readonly syncService: StandupStatusSyncService) {}

  @OnEvent(STANDUP_STATUS_CHANGED_EVENT)
  async handle(event: StandupStatusChangedEvent): Promise<void> {
    if (event.source === 'discord') {
      return
    }

    if (
      event.newStatus !== 'approved' &&
      event.newStatus !== 'rejected' &&
      event.newStatus !== 'published'
    ) {
      return
    }

    const result = await this.syncService.syncStatus({
      standupId: event.standupId,
      newStatus: event.newStatus,
    })

    if (result.isErr()) {
      logger.warn('Failed to sync standup status to Discord', {
        standupId: event.standupId,
        newStatus: event.newStatus,
        error: result.error.message,
      })
    }
  }
}
