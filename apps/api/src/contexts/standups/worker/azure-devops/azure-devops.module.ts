import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AzureDevopsActivityCollectorService } from './azure-devops-activity-collector.service'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [
    AzureDevopsMcpClientService,
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
  exports: [
    AzureDevopsMcpClientService,
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
})
export class AzureDevopsModule {}
