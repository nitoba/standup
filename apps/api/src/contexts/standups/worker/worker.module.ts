import { Module } from '@nestjs/common'
import { EmailModule } from '../../../interfaces/email/email.module'
import { DatabaseModule } from '../../../platform/database/database.module'
import { EventsModule } from '../../../platform/events/events.module'
import { AzureDevopsModule } from './azure-devops/azure-devops.module'
import { DigestsController } from './digests/digests.controller'
import { RunWeeklyDigestJobService } from './digests/run-weekly-digest-job.service'
import { WeeklyDigestDispatchService } from './digests/weekly-digest-dispatch.service'
import { GitCollectorModule } from './git-collector/git-collector.module'
import { ReminderActionsService } from './reminders/reminder-actions.service'
import { RemindersController } from './reminders/reminders.controller'
import { ListWorkerReposService } from './repos/list-worker-repos.service'
import { ReposController } from './repos/repos.controller'
import { WorkerSchedulerService } from './scheduler/worker-scheduler.service'
import { RunStandupJobService } from './standup/run-standup-job.service'
import { StandupDispatchService } from './standup/standup-dispatch.service'
import { StandupPipelineService } from './standup/standup-pipeline.service'
import { ExecuteAdjustStrategy } from './standup/strategies/execute-adjust-strategy'
import { ExecuteGenerateStrategy } from './standup/strategies/execute-generate-strategy'
import { ExecuteRegenerateStrategy } from './standup/strategies/execute-regenerate-strategy'
import { StandupAgentModule } from './standup-agent/standup-agent.module'
import { StandupGeneratorModule } from './standup-generator/standup-generator.module'
import { WorkerEventPublisherService } from './worker-event-publisher.service'
import { WorkerRuntimeConfigModule } from './worker-runtime-config.module'

@Module({
  imports: [
    EventsModule,
    DatabaseModule,
    EmailModule,
    WorkerRuntimeConfigModule,
    AzureDevopsModule,
    GitCollectorModule,
    StandupGeneratorModule,
    StandupAgentModule,
  ],
  controllers: [ReposController, RemindersController, DigestsController],
  providers: [
    WorkerEventPublisherService,
    ReminderActionsService,
    ListWorkerReposService,
    ExecuteGenerateStrategy,
    ExecuteRegenerateStrategy,
    ExecuteAdjustStrategy,
    StandupPipelineService,
    RunStandupJobService,
    StandupDispatchService,
    RunWeeklyDigestJobService,
    WeeklyDigestDispatchService,
    WorkerSchedulerService,
  ],
  exports: [
    WorkerRuntimeConfigModule,
    WorkerEventPublisherService,
    ReminderActionsService,
    ListWorkerReposService,
    StandupDispatchService,
    RunWeeklyDigestJobService,
    WeeklyDigestDispatchService,
  ],
})
export class WorkerModule {}
