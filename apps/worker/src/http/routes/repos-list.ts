import type { AzureMcpClient, RepoInfo } from '@standup/azure-devops'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-repos-list',
})

/**
 * GET /internal/repos/list
 *
 * Lista repositórios dos projetos Azure DevOps configurados.
 * Usa o MCP client singleton já conectado na inicialização do worker.
 * Retorna { repos: RepoInfo[] } onde cada repo tem { name, id, project }.
 */
export function registerReposListRoute(
  app: Hono,
  opts: { mcpClient: AzureMcpClient; azureProjects: string[] },
): void {
  app.get('/internal/repos/list', async (c) => {
    const allRepos: RepoInfo[] = []

    for (const project of opts.azureProjects) {
      const result = await opts.mcpClient.listRepositories(project)
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
      projects: opts.azureProjects,
    })

    return c.json({ repos: allRepos })
  })
}
