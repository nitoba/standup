import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { StandupGeneratorService } from './standup-generator.service'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule],
  providers: [StandupPromptService, StandupGeneratorService],
  exports: [StandupPromptService, StandupGeneratorService],
})
export class StandupGeneratorModule {}
