import type { AzureMcpClient, RepoInfo } from '@standup/azure-devops'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-repos-list',
})

export interface ListReposDeps {
  mcpClient: AzureMcpClient
  projects: string[]
}

/**
 * Handler para GET /internal/repos/list.
 * Lista repositórios dos projetos Azure DevOps configurados.
 * Usa o MCP client singleton já conectado na inicialização do worker.
 * Retorna { repos: RepoInfo[] } onde cada repo tem { name, id, project }.
 */
export async function handleListRepos(
  c: Context,
  deps: ListReposDeps,
): Promise<Response> {
  const allRepos: RepoInfo[] = []

  for (const project of deps.projects) {
    const result = await deps.mcpClient.listRepositories(project)
    if (result.isErr()) {
      logger.warn('Failed to list repos for project', {
        project,
        error: result.error.message,
      })
      // Non-fatal: continue with other projects
      continue
    }
    allRepos.push(...result.value)
  }

  logger.info('Listed repositories', {
    total: allRepos.length,
    projects: deps.projects,
  })

  return c.json({ repos: allRepos })
}
