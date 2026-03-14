import { Module } from '@nestjs/common'
import { ApiReferenceController } from './api-reference.controller'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController, ApiReferenceController],
})
export class HttpModule {}
