import { Module } from '@nestjs/common'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule],
  providers: [StandupAgentService],
  exports: [StandupAgentService],
})
export class StandupAgentModule {}
