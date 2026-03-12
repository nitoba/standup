import { sValidator } from '@hono/standard-validator'
import { StandupStatusSchema } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import * as z from 'zod'
import { notifyStandupStatusChanged } from '../../../notifications/notify-standup-status-changed.js'
import { updateStandupStatus } from '../../../services/standup-service.js'
import { getUserId } from '../../utils/get-user-id.js'
import { mapDomainErrorToResponse } from '../../utils/map-domain-error.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-update-status',
})

export const updateStatusBodySchema = z.object({
  status: StandupStatusSchema.exclude(['approved']),
})

export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>

export interface UpdateStatusDeps {
  databaseUrl: string
  botInternalUrl: string
  internalSecret: string
}

/**
 * PATCH /standups/:id/status
 * Transições diretas/rejeição. Aprovação tem rota dedicada.
 */
export function registerUpdateStandupStatusRoute(
  app: Hono<any>,
  opts: UpdateStatusDeps,
): void {
  app.patch(
    '/standups/:id/status',
    sValidator('json', updateStatusBodySchema),
    async (c) => {
      const userId = getUserId(c)
      if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const id = c.req.param('id')
      const body = c.req.valid('json')

      const result = await updateStandupStatus(id, userId, body.status, {
        databaseUrl: opts.databaseUrl,
      })

      if (result.isErr()) {
        logger.error('Failed to update standup status', {
          id,
          message: result.error.message,
        })
        return mapDomainErrorToResponse(result.error, c)
      }

      const standup = result.value

      void notifyStandupStatusChanged({
        botInternalUrl: opts.botInternalUrl,
        internalSecret: opts.internalSecret,
        standupId: standup.id,
        newStatus: standup.status,
      })

      return c.json({ data: standup })
    },
  )
}
