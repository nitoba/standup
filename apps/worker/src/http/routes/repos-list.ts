import type { AzureMcpClient } from '@standup/azure-devops'
import type { Hono } from 'hono'
import { handleListRepos } from '../../handlers/repos-list.js'

export function registerReposListRoute(
  app: Hono,
  opts: { mcpClient: AzureMcpClient; azureProjects: string[] },
): void {
  app.get('/internal/repos/list', (c) =>
    handleListRepos(c, {
      mcpClient: opts.mcpClient,
      projects: opts.azureProjects,
    }),
  )
}
