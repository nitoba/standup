import {
  InvalidStateTransitionError,
  NotFoundError,
  StandupStatusSchema,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import * as z from 'zod'
import { notifyStandupStatusChanged } from '../notifications/notify-standup-status-changed.js'
import { updateStandupStatus } from '../services/standup-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-update-status',
})

export const updateStatusBodySchema = z.object({
  status: StandupStatusSchema.exclude(['approved']),
})

export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>

export interface UpdateStatusNotifyOpts {
  botInternalUrl: string
  internalSecret: string
}

/**
 * PATCH /standups/:id/status
 * Atualiza o status de um standup para transições diretas/rejeição.
 * Aprovação segue o fluxo dedicado em POST /standups/:id/approve.
 * Após mudança de status, notifica o discord-bot para sincronizar a DM.
 */
export async function handleUpdateStandupStatus(
  c: Context,
  id: string,
  body: UpdateStatusBody,
  databaseUrl: string,
  userId: string,
  notifyOpts: UpdateStatusNotifyOpts,
): Promise<Response> {
  const result = await updateStandupStatus(id, userId, body.status, {
    databaseUrl,
  })

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

  const standup = result.value

  // Notificar o bot para sincronizar a DM (remover botões + emoji de status)
  void notifyStandupStatusChanged({
    botInternalUrl: notifyOpts.botInternalUrl,
    internalSecret: notifyOpts.internalSecret,
    standupId: standup.id,
    newStatus: standup.status,
  })

  return c.json({ data: standup })
}
