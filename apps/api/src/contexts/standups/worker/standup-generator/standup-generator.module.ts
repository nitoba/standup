import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { LlmProviderRegistry } from './llm-provider-registry'
import { MeetingScheduleService } from './meeting-schedule.service'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [
    StandupPromptService,
    LlmProviderRegistry,
    MeetingScheduleService,
  ],
  exports: [StandupPromptService, LlmProviderRegistry],
})
export class StandupGeneratorModule {}
