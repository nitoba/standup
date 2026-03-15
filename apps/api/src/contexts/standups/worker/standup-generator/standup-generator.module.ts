import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { StandupGeneratorService } from './standup-generator.service'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [StandupPromptService, StandupGeneratorService],
  exports: [StandupPromptService, StandupGeneratorService],
})
export class StandupGeneratorModule {}
