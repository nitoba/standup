import { sValidator } from '@hono/standard-validator'
import type { CustomEntries } from '@standup/domain'
import { CustomEntriesSchema } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import * as z from 'zod'
import { notifyStandupStatusChanged } from '../../../notifications/notify-standup-status-changed.js'
import { approveStandup } from '../../../services/standup-approve-service.js'
import { getUserId } from '../../utils/get-user-id.js'
import { mapDomainErrorToResponse } from '../../utils/map-domain-error.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-approve',
})

export const approveBodySchema = z.object({
  customEntries: CustomEntriesSchema.nullable().optional(),
})

export type ApproveBody = z.infer<typeof approveBodySchema>

export interface ApproveHandlerDeps {
  databaseUrl: string
  botInternalUrl: string
  internalSecret: string
}

/**
 * POST /standups/:id/approve
 * Fluxo dedicado de aprovacao + publicacao via bot.
 */
export function registerApproveStandupRoute(
  app: Hono<any>,
  opts: ApproveHandlerDeps,
): void {
  app.post(
    '/standups/:id/approve',
    sValidator('json', approveBodySchema),
    async (c) => {
      const userId = getUserId(c)
      if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const standupId = c.req.param('id')
      const body = c.req.valid('json')

      const result = await approveStandup(
        standupId,
        userId,
        { databaseUrl: opts.databaseUrl },
        (body.customEntries ?? undefined) as CustomEntries | null | undefined,
      )

      if (result.isErr()) {
        logger.error('Failed to approve standup', {
          standupId,
          message: result.error.message,
        })
        return mapDomainErrorToResponse(result.error, c)
      }

      const standup = result.value

      void notifyStandupStatusChanged({
        botInternalUrl: opts.botInternalUrl,
        internalSecret: opts.internalSecret,
        standupId: standup.id,
        newStatus: 'approved',
      })

      return c.json({ data: standup }, 200)
    },
  )
}
