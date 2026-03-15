import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { GitCollectorService } from './git-collector.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [GitCollectorService],
  exports: [GitCollectorService],
})
export class GitCollectorModule {}
