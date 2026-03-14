import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ApiReferenceController } from './api-reference.controller'
import { GlobalExceptionFilter } from './global-exception.filter'
import { HealthController } from './health.controller'

@Module({
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
