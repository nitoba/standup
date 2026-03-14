import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { AppLoggerFactory } from '../../../shared/logger'
import {
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupStatusChangedEvent,
} from '../../events/standup-events'
import { StandupStatusSyncService } from '../services/standup-status-sync.service'

@Injectable()
export class StandupStatusChangedListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly syncService: StandupStatusSyncService,
  ) {
    this.logger = this.loggerFactory.create(
      'discord-standup-status-changed-listener',
    )
  }

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
      this.logger.warn('Failed to sync standup status to Discord', {
        standupId: event.standupId,
        newStatus: event.newStatus,
        error: result.error.message,
      })
    }
  }
}
