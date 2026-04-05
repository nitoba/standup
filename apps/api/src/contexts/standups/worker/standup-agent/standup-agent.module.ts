import { Module } from '@nestjs/common'
import { EnvModule } from '../../../../platform/env/env.module'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { mastraProviders } from './mastra/mastra.provider'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule, EnvModule],
  providers: [...mastraProviders, StandupAgentService],
  exports: [StandupAgentService],
})
export class StandupAgentModule {}
