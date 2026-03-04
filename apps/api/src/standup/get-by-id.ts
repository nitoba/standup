import { NotFoundError } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { getStandupById } from '../services/standup-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-get-by-id',
})

/**
 * GET /standups/:id
 * Retorna um standup pelo ID.
 * 404 se não encontrado, 500 se erro de banco.
 */
export async function handleGetStandupById(
  c: Context,
  id: string,
  databaseUrl: string,
): Promise<Response> {
  const result = await getStandupById(id, { databaseUrl })

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
}
