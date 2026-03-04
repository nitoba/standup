import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type {
  AzureMcpConfig,
  PullRequestDetail,
  WorkItemDetail,
} from '../types.js'

const logger = createServiceLogger({
  service: 'standup-generator',
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
}

export function createAzureMcpClient(config: AzureMcpConfig): AzureMcpClient {
  let client: Client | null = null

  async function connect(): Promise<Result<void, ExternalServiceError>> {
    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@tiberriver256/mcp-server-azure-devops'],
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
      return Result.ok(undefined)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Failed to connect to Azure MCP server', { error: message })
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Connection failed: ${message}`,
        }),
      )
    }
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
    try {
      const result = await client.callTool({ name, arguments: args })
      return Result.ok(result.content)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Tool call '${name}' failed: ${message}`,
        }),
      )
    }
  }

  async function getMe(): Promise<Result<string, ExternalServiceError>> {
    const result = await callTool('get_me', {})
    if (result.isErr()) return result

    try {
      const content = result.value as Array<{ type: string; text: string }>
      const text = content[0]?.text ?? '{}'
      const parsed = JSON.parse(text) as { id?: string }
      const uuid = parsed.id
      if (!uuid) {
        return Result.err(
          new ExternalServiceError({
            service: 'azure-devops',
            message: 'get_me returned no user ID',
          }),
        )
      }
      return Result.ok(uuid)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_me response: ${message}`,
        }),
      )
    }
  }

  async function getWorkItem(
    id: string,
  ): Promise<Result<WorkItemDetail | null, ExternalServiceError>> {
    const result = await callTool('get_work_item', { workItemId: Number(id) })
    if (result.isErr()) return result

    try {
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

      if (!parsed.fields) return Result.ok(null)

      const assignedTo = parsed.fields['System.AssignedTo']
      const assignedToEmail =
        typeof assignedTo === 'object'
          ? (assignedTo.uniqueName ?? '')
          : (assignedTo ?? '')

      return Result.ok({
        id: String(parsed.id ?? id),
        title: parsed.fields['System.Title'] ?? '',
        state: parsed.fields['System.State'] ?? '',
        assignedTo: assignedToEmail,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse get_work_item response: ${message}`,
        }),
      )
    }
  }

  async function listPullRequests(
    repoId: string,
  ): Promise<Result<PullRequestDetail[], ExternalServiceError>> {
    const result = await callTool('list_pull_requests', {
      repositoryId: repoId,
      status: 'all',
    })
    if (result.isErr()) return result

    try {
      const content = result.value as Array<{ type: string; text: string }>
      const text = content[0]?.text ?? '[]'
      const parsed = JSON.parse(text) as Array<{
        pullRequestId?: number
        title?: string
        status?: string
        repository?: { id?: string }
        createdBy?: { id?: string }
      }>

      const prs: PullRequestDetail[] = parsed
        .filter((pr) => typeof pr.pullRequestId === 'number')
        .map((pr) => ({
          id: pr.pullRequestId ?? 0,
          title: pr.title ?? '',
          status: normalizeStatus(pr.status),
          repoId: pr.repository?.id ?? repoId,
          creatorId: pr.createdBy?.id ?? '',
        }))

      return Result.ok(prs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: `Failed to parse list_pull_requests response: ${message}`,
        }),
      )
    }
  }

  function normalizeStatus(
    status: string | undefined,
  ): 'active' | 'completed' | 'abandoned' {
    if (status === 'completed') return 'completed'
    if (status === 'abandoned') return 'abandoned'
    return 'active'
  }

  return { connect, disconnect, getMe, getWorkItem, listPullRequests }
}
