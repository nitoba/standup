import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { IdentityModule } from './contexts/identity/identity.module'
import { PreferencesModule } from './contexts/preferences/preferences.module'
import { StandupsModule } from './contexts/standups/standups.module'
import { DiscordModule } from './interfaces/discord/discord.module'
import { DatabaseModule } from './platform/database/database.module'
import { EnvModule } from './platform/env/env.module'
import { EventsModule } from './platform/events/events.module'
import { HttpModule } from './platform/http/http.module'
import { THROTTLER_CONFIG } from './platform/http/throttler'
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
    ThrottlerModule.forRoot(THROTTLER_CONFIG),
    DatabaseModule,
    IdentityModule,
    HttpModule,
    PreferencesModule,
    StandupsModule,
    DiscordModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
