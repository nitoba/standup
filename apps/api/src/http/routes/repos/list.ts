import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import type { WorkerFacadeDeps } from '../../../services/worker-facade-service.js'
import { listRepos } from '../../../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'repos-list',
})

function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return typeof user?.id === 'string' && user.id.length > 0
    ? user.id
    : undefined
}

/**
 * GET /repos
 */
export function registerListReposRoute(
  app: Hono<any>,
  opts: WorkerFacadeDeps,
): void {
  app.get('/repos', async (c) => {
    const userId = getUserId(c)

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await listRepos(opts)

    if (result.isErr()) {
      logger.error('Failed to list repos from worker', {
        message: result.error.message,
        service: result.error.service,
        userId,
      })
      return c.json({ error: 'Worker unavailable' }, 503)
    }

    return c.json({ data: result.value })
  })
}
