import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import type { WorkerFacadeDeps } from '../services/worker-facade-service.js'
import { listRepos } from '../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'repos-list',
})

export async function handleListRepos(
  c: Context,
  deps: WorkerFacadeDeps,
): Promise<Response> {
  const user = c.get('user') as Record<string, unknown> | undefined

  if (typeof user?.id !== 'string' || user.id.length === 0) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const result = await listRepos(deps)

  if (result.isErr()) {
    logger.error('Failed to list repos from worker', {
      message: result.error.message,
      service: result.error.service,
      userId: user.id,
    })
    return c.json({ error: 'Worker unavailable' }, 503)
  }

  return c.json({ data: result.value })
}
