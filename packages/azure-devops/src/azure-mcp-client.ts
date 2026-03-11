import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type {
  AzureMcpConfig,
  PullRequestDetail,
  RepoInfo,
  WorkItemDetail,
} from './types.js'

const logger = createServiceLogger({
  service: 'azure-devops',
  component: 'azure-mcp-client',
})

export interface AzureMcpClient {
  connect(): Promise<Result<void, ExternalServiceError>>
  disconnect(): Promise<void>
  getMe(): Promise<Result<string, ExternalServiceError>>
  getWorkItem(
    id: string,
  ): Promise<Result<WorkItemDetail | null, ExternalServiceError>>
  listPullRequests(
    repoId: string,
  ): Promise<Result<PullRequestDetail[], ExternalServiceError>>
  listRepositories(
    project: string,
  ): Promise<Result<RepoInfo[], ExternalServiceError>>
}

export function createAzureMcpClient(config: AzureMcpConfig): AzureMcpClient {
  let client: Client | null = null

  async function connect(): Promise<Result<void, ExternalServiceError>> {
    return Result.tryPromise({
      try: async () => {
        const transport = new StdioClientTransport({
          command: 'bun',
          args: ['x', '@tiberriver256/mcp-server-azure-devops'],
          env: {
            ...process.env,
            AZURE_DEVOPS_ORG_URL: config.orgUrl,
            AZURE_DEVOPS_AUTH_METHOD: 'pat',
            AZURE_DEVOPS_PAT: config.pat,
            AZURE_DEVOPS_DEFAULT_PROJECT: config.defaultProject,
            LOG_LEVEL: 'error',
          },
        })
        client = new Client({ name: 'standup-generator', version: '0.0.1' })
        await client.connect(transport)
        logger.info('Azure MCP client connected')
      },
      catch: (err) => {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Failed to connect to Azure MCP server', {
          error: message,
        })
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Connection failed: ${message}`,
        })
      },
    })
  }

  async function disconnect(): Promise<void> {
    if (client) {
      try {
        await client.close()
      } catch {
        // best-effort disconnect
      }
      client = null
      logger.info('Azure MCP client disconnected')
    }
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Result<unknown, ExternalServiceError>> {
    if (!client) {
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'Client not connected',
        }),
      )
    }
    const connectedClient = client
    return Result.tryPromise({
      try: async () => {
        const result = await connectedClient.callTool({ name, arguments: args })
        return result.content
      },
      catch: (err) => {
        const message = err instanceof Error ? err.message : String(err)
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Tool call '${name}' failed: ${message}`,
        })
      },
    })
  }

  async function getMe(): Promise<Result<string, ExternalServiceError>> {
    const result = await callTool('get_me', {})
    if (result.isErr()) return result

    return Result.tryPromise({
      try: async () => {
        const content = result.value as Array<{ type: string; text: string }>
        const text = content[0]?.text ?? '{}'
        const parsed = JSON.parse(text) as { id?: string }
        const uuid = parsed.id
        if (!uuid) {
          throw new ExternalServiceError({
            service: 'azure-devops',
            message: 'get_me returned no user ID',
          })
        }
        return uuid
      },
      catch: (err) => {
        if (err instanceof ExternalServiceError) return err
        const message = err instanceof Error ? err.message : String(err)
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_me response: ${message}`,
        })
      },
    })
  }

  async function getWorkItem(
    id: string,
  ): Promise<Result<WorkItemDetail | null, ExternalServiceError>> {
    const result = await callTool('get_work_item', { workItemId: Number(id) })
    if (result.isErr()) return result

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

        if (!parsed.fields) return null

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
      catch: (err) => {
        const message = err instanceof Error ? err.message : String(err)
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_work_item response: ${message}`,
        })
      },
    })
  }

  async function listPullRequests(
    repoId: string,
  ): Promise<Result<PullRequestDetail[], ExternalServiceError>> {
    const result = await callTool('list_pull_requests', {
      repositoryId: repoId,
      status: 'all',
    })
    if (result.isErr()) return result

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
          .filter((pr) => typeof pr.pullRequestId === 'number')
          .map((pr) => ({
            id: pr.pullRequestId ?? 0,
            title: pr.title ?? '',
            status: normalizeStatus(pr.status),
            repoId: pr.repository?.id ?? repoId,
            creatorId: pr.createdBy?.id ?? '',
          })) satisfies PullRequestDetail[]
      },
      catch: (err) => {
        const message = err instanceof Error ? err.message : String(err)
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse list_pull_requests response: ${message}`,
        })
      },
    })
  }

  function normalizeStatus(
    status: string | undefined,
  ): 'active' | 'completed' | 'abandoned' {
    if (status === 'completed') return 'completed'
    if (status === 'abandoned') return 'abandoned'
    return 'active'
  }

  async function listRepositories(
    project: string,
  ): Promise<Result<RepoInfo[], ExternalServiceError>> {
    const result = await callTool('list_repositories', { projectId: project })
    if (result.isErr()) return result

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
          .filter((r) => typeof r.name === 'string' && typeof r.id === 'string')
          .map((r) => ({
            id: r.id ?? '',
            name: r.name ?? '',
            project: r.project?.name ?? project,
          })) satisfies RepoInfo[]
      },
      catch: (err) => {
        const message = err instanceof Error ? err.message : String(err)
        return new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse list_repositories response: ${message}`,
        })
      },
    })
  }

  return {
    connect,
    disconnect,
    getMe,
    getWorkItem,
    listPullRequests,
    listRepositories,
  }
}
