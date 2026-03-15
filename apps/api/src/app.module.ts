import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { IdentityModule } from './contexts/identity/identity.module'
import { PreferencesModule } from './contexts/preferences/preferences.module'
import { StandupsModule } from './contexts/standups/standups.module'
import { DiscordModule } from './interfaces/discord/discord.module'
import { DatabaseModule } from './platform/database/database.module'
import { EnvModule } from './platform/env/env.module'
import { EventsModule } from './platform/events/events.module'
import { HttpModule } from './platform/http/http.module'
import { LoggerModule } from './platform/logger/logger.module'
import { ObservabilityModule } from './platform/observability/observability.module'
import { TimeModule } from './platform/time/time.module'

@Module({
  imports: [
    EnvModule,
    ObservabilityModule,
    LoggerModule,
    TimeModule,
    EventsModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    IdentityModule,
    HttpModule,
    PreferencesModule,
    StandupsModule,
    DiscordModule,
  ],
})
export class AppModule {}
