import { NotFoundError } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { getStandupById } from '../../../services/standup-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-get-by-id',
})

function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return user?.id as string | undefined
}

/**
 * GET /standups/:id
 * Retorna um standup pelo ID.
 */
export function registerGetStandupByIdRoute(
  app: Hono<any>,
  opts: { databaseUrl: string },
): void {
  app.get('/standups/:id', async (c) => {
    const userId = getUserId(c)
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const id = c.req.param('id')
    const result = await getStandupById(id, userId, {
      databaseUrl: opts.databaseUrl,
    })

    if (result.isErr()) {
      if (NotFoundError.is(result.error)) {
        return c.json({ error: result.error.message }, 404) as Response
      }
      logger.error('Failed to fetch standup', {
        id,
        operation: result.error.operation,
        message: result.error.message,
      })
      return c.json({ error: 'Internal server error' }, 500) as Response
    }

    return c.json({ data: result.value })
  })
}
