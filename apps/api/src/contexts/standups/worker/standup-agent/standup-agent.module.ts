import { Module } from '@nestjs/common'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AgentSessionManager } from './agent-session-manager'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule, WorkerRuntimeConfigModule],
  providers: [AgentSessionManager, StandupAgentService],
  exports: [AgentSessionManager, StandupAgentService],
})
export class StandupAgentModule {}
