import { Module } from '@nestjs/common'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule, WorkerRuntimeConfigModule],
  providers: [StandupAgentService],
  exports: [StandupAgentService],
})
export class StandupAgentModule {}
