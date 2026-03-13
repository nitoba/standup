import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { StandupAuthModule } from './modules/auth/auth.module'
import { DiscordModule } from './modules/discord/discord.module'
import { EventsModule } from './modules/events/events.module'
import { HttpModule } from './modules/http/http.module'
import { StandupsModule } from './modules/standups/standups.module'
import { WorkerModule } from './modules/worker/worker.module'
import { DatabaseModule } from './shared/database/database.module'
import { EnvModule } from './shared/env/env.module'

@Module({
  imports: [
    EnvModule,
    EventsModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    StandupAuthModule,
    HttpModule,
    StandupsModule,
    WorkerModule,
    DiscordModule,
  ],
})
export class AppModule {}
