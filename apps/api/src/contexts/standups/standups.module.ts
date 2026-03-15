import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../platform/database/database.module'
import { ApproveStandupController } from './approval/approve-standup.controller'
import { ApproveStandupService } from './approval/approve-standup.service'
import { StandupEventsController } from './events/standup-events.controller'
import { StandupSseListener } from './events/standup-sse.listener'
import { StandupSseBusService } from './events/standup-sse-bus.service'
import { StandupsQueryController } from './query/standups-query.controller'
import { StandupsQueryService } from './query/standups-query.service'
import { StandupStatusController } from './status/standup-status.controller'
import { StandupStatusService } from './status/standup-status.service'
import { TriggerStandupController } from './trigger/trigger-standup.controller'
import { TriggerStandupService } from './trigger/trigger-standup.service'
import { ReminderActionsService } from './worker/reminders/reminder-actions.service'
import { ListWorkerReposService } from './worker/repos/list-worker-repos.service'
import { StandupDispatchService } from './worker/standup/standup-dispatch.service'
import { WorkerModule } from './worker/worker.module'

@Module({
  imports: [DatabaseModule, WorkerModule],
  controllers: [
    TriggerStandupController,
    StandupEventsController,
    StandupsQueryController,
    StandupStatusController,
    ApproveStandupController,
  ],
  providers: [
    TriggerStandupService,
    StandupSseBusService,
    StandupSseListener,
    StandupsQueryService,
    StandupStatusService,
    ApproveStandupService,
  ],
  exports: [
    TriggerStandupService,
    ReminderActionsService,
    ListWorkerReposService,
    StandupDispatchService,
    WorkerModule,
  ],
})
export class StandupsModule {}
