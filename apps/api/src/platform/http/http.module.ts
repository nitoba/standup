import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { DiscordModule } from '../../interfaces/discord/discord.module'
import { ApiReferenceController } from './controllers/api-reference.controller'
import { HealthController } from './controllers/health.controller'
import { GlobalExceptionFilter } from './filters/global-exception.filter'

@Module({
  imports: [DiscordModule],
  controllers: [HealthController, ApiReferenceController],
  providers: [
    GlobalExceptionFilter,
    {
      provide: APP_FILTER,
      useExisting: GlobalExceptionFilter,
    },
  ],
})
export class HttpModule {}
