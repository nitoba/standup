import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [AzureDevopsMcpClientService, AzureDevopsEnrichmentService],
  exports: [AzureDevopsMcpClientService, AzureDevopsEnrichmentService],
})
export class AzureDevopsModule {}
