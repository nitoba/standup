import { Module } from '@nestjs/common'
import { EventsModule } from '../events/events.module'
import { DiscordClientService } from './discord-client.service'
import { DiscordEventsListener } from './discord-events.listener'

@Module({
  imports: [EventsModule],
  providers: [DiscordClientService, DiscordEventsListener],
  exports: [DiscordClientService],
})
export class DiscordModule {}
