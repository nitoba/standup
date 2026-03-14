import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../shared/database/database.module'
import { StandupTriggerRequestedListener } from './trigger/standup-trigger-requested.listener'
import { TriggerStandupController } from './trigger/trigger-standup.controller'
import { TriggerStandupService } from './trigger/trigger-standup.service'

@Module({
  imports: [DatabaseModule],
  controllers: [TriggerStandupController],
  providers: [TriggerStandupService, StandupTriggerRequestedListener],
  exports: [TriggerStandupService],
})
export class StandupsModule {}
