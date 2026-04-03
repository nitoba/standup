import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { GitCollectorService } from './git-collector.service'
import { RepoCloneListener } from './repo-clone.listener'
import { RepoCloneService } from './repo-clone.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [GitCollectorService, RepoCloneService, RepoCloneListener],
  exports: [GitCollectorService, RepoCloneService],
})
export class GitCollectorModule {}
