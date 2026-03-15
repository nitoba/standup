import { Module } from '@nestjs/common'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'

@Module({
  providers: [AzureDevopsMcpClientService, AzureDevopsEnrichmentService],
  exports: [AzureDevopsMcpClientService, AzureDevopsEnrichmentService],
})
export class AzureDevopsModule {}
