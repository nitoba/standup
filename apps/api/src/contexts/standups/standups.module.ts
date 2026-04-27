import { forwardRef, Module } from '@nestjs/common'
import { DiscordModule } from '../../interfaces/discord/discord.module'
import { DatabaseModule } from '../../platform/database/database.module'
import { ApproveStandupController } from './approval/approve-standup.controller'
import { ApproveStandupService } from './approval/approve-standup.service'
import { RetryDmController } from './delivery/retry-dm.controller'
import { RetryDmService } from './delivery/retry-dm.service'
import { StandupEventsController } from './events/standup-events.controller'
import { StandupSseListener } from './events/standup-sse.listener'
import { StandupSseBusService } from './events/standup-sse-bus.service'
import { StandupsQueryController } from './query/standups-query.controller'
import { StandupsQueryService } from './query/standups-query.service'
import { SendToDiscordController } from './send-to-discord/send-to-discord.controller'
import { SendToDiscordService } from './send-to-discord/send-to-discord.service'
import { UserTimezoneService } from './shared/user-timezone.service'
import { StandupStatusController } from './status/standup-status.controller'
import { StandupStatusService } from './status/standup-status.service'
import { TriggerStandupController } from './trigger/trigger-standup.controller'
import { TriggerStandupService } from './trigger/trigger-standup.service'
import { WorkerModule } from './worker/worker.module'

@Module({
  imports: [DatabaseModule, WorkerModule, forwardRef(() => DiscordModule)],
  controllers: [
    TriggerStandupController,
    StandupEventsController,
    StandupsQueryController,
    StandupStatusController,
    ApproveStandupController,
    SendToDiscordController,
    RetryDmController,
  ],
  providers: [
    TriggerStandupService,
    StandupSseBusService,
    StandupSseListener,
    StandupsQueryService,
    StandupStatusService,
    ApproveStandupService,
    SendToDiscordService,
    RetryDmService,
    UserTimezoneService,
  ],
  exports: [
    TriggerStandupService,
    ApproveStandupService,
    StandupStatusService,
    RetryDmService,
    WorkerModule,
  ],
})
export class StandupsModule {}
