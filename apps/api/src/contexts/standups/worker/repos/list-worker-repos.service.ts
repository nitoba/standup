import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  WORKER_REPOS_REQUESTED_EVENT,
  type WorkerReposRequestedEvent,
} from '../../../../platform/events/standup-events'
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

  @OnEvent(WORKER_REPOS_REQUESTED_EVENT)
  handleRequestedRepos(
    _event: WorkerReposRequestedEvent,
  ): Promise<Result<RepoInfo[], ExternalServiceError>> {
    return this.listRepos()
  }

  async listRepos(): Promise<Result<RepoInfo[], ExternalServiceError>> {
    return this.azureDevopsEnrichment.listRepositories(
      this.runtimeConfig.config.AZURE_DEVOPS_PROJECTS,
    )
  }
}
