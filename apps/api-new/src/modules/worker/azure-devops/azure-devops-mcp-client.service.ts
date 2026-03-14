import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ExternalServiceError, Result } from '@standup/domain'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { PullRequestDetail, RepoInfo, WorkItemDetail } from './types'

@Injectable()
export class AzureDevopsMcpClientService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AzureDevopsMcpClientService.name)
  private client: Client | null = null

  constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {}

  async onModuleInit(): Promise<void> {
    const config = this.runtimeConfig.config

    if (!config.AZURE_DEVOPS_ORG || !config.AZURE_DEVOPS_PAT) {
      this.logger.warn(
        'Azure DevOps nao configurado. O worker continua funcional, mas sem MCP.',
      )
      return
    }

    const connectResult = await this.connect()
    if (connectResult.isErr()) {
      this.logger.error(connectResult.error.message)
      this.client = null
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return
    }

    try {
      await this.client.close()
    } catch {
      // best-effort shutdown
    } finally {
      this.client = null
    }
  }

  async connect(): Promise<Result<void, ExternalServiceError>> {
    const config = this.runtimeConfig.config

    return Result.tryPromise({
      try: async () => {
        const transport = new StdioClientTransport({
          command: 'bun',
          args: ['x', '@tiberriver256/mcp-server-azure-devops'],
          env: {
            ...process.env,
            AZURE_DEVOPS_ORG_URL: `https://dev.azure.com/${config.AZURE_DEVOPS_ORG}`,
            AZURE_DEVOPS_AUTH_METHOD: 'pat',
            AZURE_DEVOPS_PAT: config.AZURE_DEVOPS_PAT,
            AZURE_DEVOPS_DEFAULT_PROJECT: config.AZURE_DEVOPS_DEFAULT_PROJECT,
            LOG_LEVEL: 'error',
          },
        })

        this.client = new Client({ name: 'standup-api-new', version: '0.0.1' })
        await this.client.connect(transport)
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async getMe(): Promise<Result<string, ExternalServiceError>> {
    const result = await this.callTool('get_me', {})
    if (result.isErr()) {
      return result
    }

    return Result.tryPromise({
      try: async () => {
        const content = result.value as Array<{ type: string; text: string }>
        const text = content[0]?.text ?? '{}'
        const parsed = JSON.parse(text) as { id?: string }

        if (!parsed.id) {
          throw new Error('get_me returned no user ID')
        }

        return parsed.id
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_me response: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async getWorkItem(
    id: string,
  ): Promise<Result<WorkItemDetail | null, ExternalServiceError>> {
    const result = await this.callTool('get_work_item', {
      workItemId: Number(id),
    })
    if (result.isErr()) {
      return result
    }

    return Result.tryPromise({
      try: async () => {
        const content = result.value as Array<{ type: string; text: string }>
        const text = content[0]?.text ?? '{}'
        const parsed = JSON.parse(text) as {
          id?: number
          fields?: {
            'System.Title'?: string
            'System.State'?: string
            'System.AssignedTo'?: { uniqueName?: string } | string
          }
        }

        if (!parsed.fields) {
          return null
        }

        const assignedTo = parsed.fields['System.AssignedTo']
        const assignedToEmail =
          typeof assignedTo === 'object'
            ? (assignedTo.uniqueName ?? '')
            : (assignedTo ?? '')

        return {
          id: String(parsed.id ?? id),
          title: parsed.fields['System.Title'] ?? '',
          state: parsed.fields['System.State'] ?? '',
          assignedTo: assignedToEmail,
        }
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_work_item response: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async listPullRequests(
    repoId: string,
  ): Promise<Result<PullRequestDetail[], ExternalServiceError>> {
    const result = await this.callTool('list_pull_requests', {
      repositoryId: repoId,
      status: 'all',
    })
    if (result.isErr()) {
      return result
    }

    return Result.tryPromise({
      try: async () => {
        const content = result.value as Array<{ type: string; text: string }>
        const text = content[0]?.text ?? '[]'
        const parsed = JSON.parse(text) as Array<{
          pullRequestId?: number
          title?: string
          status?: string
          repository?: { id?: string }
          createdBy?: { id?: string }
        }>

        return parsed
          .filter(
            (pullRequest) => typeof pullRequest.pullRequestId === 'number',
          )
          .map((pullRequest) => ({
            id: pullRequest.pullRequestId ?? 0,
            title: pullRequest.title ?? '',
            status: this.normalizePullRequestStatus(pullRequest.status),
            repoId: pullRequest.repository?.id ?? repoId,
            creatorId: pullRequest.createdBy?.id ?? '',
          }))
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse list_pull_requests response: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  async listRepositories(
    project: string,
  ): Promise<Result<RepoInfo[], ExternalServiceError>> {
    const result = await this.callTool('list_repositories', {
      projectId: project,
    })
    if (result.isErr()) {
      return result
    }

    return Result.tryPromise({
      try: async () => {
        const content = result.value as Array<{ type: string; text: string }>
        const text = content[0]?.text ?? '[]'
        const parsed = JSON.parse(text) as Array<{
          id?: string
          name?: string
          project?: { name?: string }
        }>

        return parsed
          .filter((repository) => {
            return (
              typeof repository.id === 'string' &&
              typeof repository.name === 'string'
            )
          })
          .map((repository) => ({
            id: repository.id ?? '',
            name: repository.name ?? '',
            project: repository.project?.name ?? project,
          }))
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse list_repositories response: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  isConnected(): boolean {
    return this.client !== null
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Result<unknown, ExternalServiceError>> {
    if (!this.client) {
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'Client not connected',
        }),
      )
    }

    const client = this.client

    return Result.tryPromise({
      try: async () => {
        const result = await client.callTool({ name, arguments: args })
        return result.content
      },
      catch: (error) =>
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Tool call '${name}' failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    })
  }

  private normalizePullRequestStatus(
    status: string | undefined,
  ): 'active' | 'completed' | 'abandoned' {
    if (status === 'completed') {
      return 'completed'
    }

    if (status === 'abandoned') {
      return 'abandoned'
    }

    return 'active'
  }
}
