import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { StandupAuthModule } from './modules/auth/auth.module'
import { DiscordModule } from './modules/discord/discord.module'
import { EventsModule } from './modules/events/events.module'
import { HttpModule } from './modules/http/http.module'
import { SettingsModule } from './modules/settings/settings.module'
import { StandupsModule } from './modules/standups/standups.module'
import { WorkerModule } from './modules/worker/worker.module'
import { DatabaseModule } from './shared/database/database.module'
import { EnvModule } from './shared/env/env.module'
import { LoggerModule } from './shared/logger/logger.module'
import { ObservabilityModule } from './shared/observability/observability.module'
import { TimeModule } from './shared/time/time.module'

@Module({
  imports: [
    EnvModule,
    ObservabilityModule,
    LoggerModule,
    TimeModule,
    EventsModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    StandupAuthModule,
    HttpModule,
    SettingsModule,
    StandupsModule,
    WorkerModule,
    DiscordModule,
  ],
})
export class AppModule {}
