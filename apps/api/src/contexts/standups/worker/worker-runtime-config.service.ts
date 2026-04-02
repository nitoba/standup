import { Injectable } from '@nestjs/common'
import { EnvService } from '../../../platform/env/env.service'

export interface WorkerRuntimeConfig {
  DATABASE_URL: string
  DATABASE_AUTH_TOKEN?: string
  REPOS_ROOT_PATH: string
  SCHEDULER_ENABLED: boolean
  GOOGLE_API_KEY: string
  GROQ_API_KEY: string
  OPENROUTER_API_KEY: string
  LLM_PROVIDERS_CONFIG: string
  AZURE_DEVOPS_ORG: string
  AZURE_DEVOPS_PAT: string
  AZURE_DEVOPS_DEFAULT_PROJECT: string
  AZURE_DEVOPS_PROJECTS: string[]
  USE_PI_AGENT: boolean
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
      GOOGLE_API_KEY: this.env.worker.googleApiKey ?? '',
      GROQ_API_KEY: this.env.worker.groqApiKey ?? '',
      OPENROUTER_API_KEY: this.env.worker.openrouterApiKey ?? '',
      LLM_PROVIDERS_CONFIG: this.env.worker.llmProvidersConfig ?? '[]',
      AZURE_DEVOPS_ORG: this.env.worker.azureDevopsOrg ?? '',
      AZURE_DEVOPS_PAT: this.env.worker.azureDevopsPat ?? '',
      AZURE_DEVOPS_DEFAULT_PROJECT: this.env.worker.azureDevopsDefaultProject,
      AZURE_DEVOPS_PROJECTS: this.env.worker.azureDevopsProjects,
      USE_PI_AGENT: this.env.worker.usePiAgent,
    }
  }
}
