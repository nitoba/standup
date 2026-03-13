import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { StandupWorkflowService } from './standup-workflow.service'
import { WorkerSchedulerService } from './worker-scheduler.service'

@Module({
  imports: [EventsModule],
  providers: [StandupWorkflowService, WorkerSchedulerService],
  exports: [StandupWorkflowService],
})
export class WorkerModule {}
