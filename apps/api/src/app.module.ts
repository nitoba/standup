import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { StandupAuthModule } from "./modules/auth/auth.module";
import { DiscordModule } from "./modules/discord/discord.module";
import { EventsModule } from "./shared/module/events/events.module";
import { HttpModule } from "./shared/module/http/http.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { StandupsModule } from "./modules/standups/standups.module";
import { WorkerModule } from "./modules/worker/worker.module";
import { DatabaseModule } from "./shared/module/database/database.module";
import { EnvModule } from "./shared/module/env/env.module";
import { LoggerModule } from "./shared/module/logger/logger.module";
import { ObservabilityModule } from "./shared/module/observability/observability.module";
import { TimeModule } from "./shared/time/time.module";

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
