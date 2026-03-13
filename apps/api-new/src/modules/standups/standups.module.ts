import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { StandupsController } from './standups.controller'
import { StandupsService } from './standups.service'

@Module({
  imports: [EventsModule],
  controllers: [StandupsController],
  providers: [StandupsService],
  exports: [StandupsService],
})
export class StandupsModule {}
