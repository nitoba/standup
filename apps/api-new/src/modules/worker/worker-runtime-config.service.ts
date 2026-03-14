import { Injectable } from '@nestjs/common'
import { EnvService } from '../../shared/env/env.service'

export interface WorkerRuntimeConfig {
  DATABASE_URL: string
  DATABASE_AUTH_TOKEN?: string
  REPOS_ROOT_PATH: string
  SCHEDULER_ENABLED: boolean
  AI_PROVIDER_API_KEY: string
  AZURE_DEVOPS_ORG: string
  AZURE_DEVOPS_PAT: string
  AZURE_DEVOPS_DEFAULT_PROJECT: string
  AZURE_DEVOPS_PROJECTS: string[]
}

@Injectable()
export class WorkerRuntimeConfigService {
  constructor(private readonly env: EnvService) {}

  get config(): WorkerRuntimeConfig {
    return {
      DATABASE_URL: this.env.database.url,
      DATABASE_AUTH_TOKEN: this.env.database.authToken,
      REPOS_ROOT_PATH: this.env.worker.reposRootPath,
      SCHEDULER_ENABLED: this.env.worker.schedulerEnabled,
      AI_PROVIDER_API_KEY: this.env.worker.aiProviderApiKey ?? '',
      AZURE_DEVOPS_ORG: this.env.worker.azureDevopsOrg ?? '',
      AZURE_DEVOPS_PAT: this.env.worker.azureDevopsPat ?? '',
      AZURE_DEVOPS_DEFAULT_PROJECT: this.env.worker.azureDevopsDefaultProject,
      AZURE_DEVOPS_PROJECTS: this.env.worker.azureDevopsProjects,
    }
  }
}
