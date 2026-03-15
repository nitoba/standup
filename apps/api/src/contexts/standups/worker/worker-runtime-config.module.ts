import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigService } from './worker-runtime-config.service'

@Module({
  providers: [WorkerRuntimeConfigService],
  exports: [WorkerRuntimeConfigService],
})
export class WorkerRuntimeConfigModule {}
