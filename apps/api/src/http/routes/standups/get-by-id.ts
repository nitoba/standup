import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { getStandupById } from '../../../services/standup-service.js'
import { getUserId } from '../../utils/get-user-id.js'
import { mapDomainErrorToResponse } from '../../utils/map-domain-error.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-get-by-id',
})

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
      logger.error('Failed to fetch standup', {
        id,
        message: result.error.message,
      })
      return mapDomainErrorToResponse(result.error, c)
    }

    return c.json({ data: result.value })
  })
}
