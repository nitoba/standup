import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { AzureDevopsEnrichmentService } from '../azure-devops/azure-devops-enrichment.service'
import type { RepoInfo } from '../azure-devops/types'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'

@Injectable()
export class ListWorkerReposService {
  constructor(
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly azureDevopsEnrichment: AzureDevopsEnrichmentService,
  ) {}

  async listRepos(): Promise<Result<RepoInfo[], ExternalServiceError>> {
    return this.azureDevopsEnrichment.listRepositories(
      this.runtimeConfig.config.AZURE_DEVOPS_PROJECTS,
    )
  }
}
