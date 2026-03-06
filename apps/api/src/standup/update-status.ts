import {
  InvalidStateTransitionError,
  NotFoundError,
  StandupStatusSchema,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import * as z from 'zod'
import { updateStandupStatus } from '../services/standup-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-update-status',
})

export const updateStatusBodySchema = z.object({
  status: StandupStatusSchema,
})

export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>

/**
 * PATCH /standups/:id/status
 * Atualiza o status de um standup (aprovação manual sem Discord).
 * A state machine valida as transições permitidas — retorna 409 para transições inválidas.
 */
export async function handleUpdateStandupStatus(
  c: Context,
  id: string,
  body: UpdateStatusBody,
  databaseUrl: string,
): Promise<Response> {
  const result = await updateStandupStatus(id, body.status, { databaseUrl })

  if (result.isErr()) {
    if (NotFoundError.is(result.error)) {
      return c.json({ error: result.error.message }, 404) as Response
    }
    if (InvalidStateTransitionError.is(result.error)) {
      return c.json({ error: result.error.message }, 409) as Response
    }
    logger.error('Failed to update standup status', {
      id,
      operation: result.error.operation,
      message: result.error.message,
    })
    return c.json({ error: 'Internal server error' }, 500) as Response
  }

  return c.json({ data: result.value })
}
