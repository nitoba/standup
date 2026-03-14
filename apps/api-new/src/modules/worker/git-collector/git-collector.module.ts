import { Module } from '@nestjs/common'
import { GitCollectorService } from './git-collector.service'

@Module({
  providers: [GitCollectorService],
  exports: [GitCollectorService],
})
export class GitCollectorModule {}
