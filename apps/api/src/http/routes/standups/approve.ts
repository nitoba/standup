import { sValidator } from '@hono/standard-validator'
import type { CustomEntries } from '@standup/domain'
import { CustomEntriesSchema, DbError } from '@standup/domain'
import type { Hono } from 'hono'
import * as z from 'zod'
import { notifyStandupStatusChanged } from '../../../notifications/notify-standup-status-changed.js'
import { approveStandup } from '../../../services/standup-approve-service.js'
import type { AppContext } from '../../types.js'

export const approveBodySchema = z.object({
  customEntries: CustomEntriesSchema.nullable().optional(),
})

export type ApproveBody = z.infer<typeof approveBodySchema>

export interface ApproveHandlerDeps {
  databaseUrl: string
  botInternalUrl: string
  internalSecret: string
}

function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return user?.id as string | undefined
}

/**
 * POST /standups/:id/approve
 * Fluxo dedicado de aprovação + publicação via bot.
 */
export function registerApproveStandupRoute(
  app: Hono<AppContext>,
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
        if (DbError.is(result.error)) {
          return c.json({ error: 'Internal server error' }, 500)
        }
        return c.json({ error: 'Internal server error' }, 500)
      }

      switch (result.value.kind) {
        case 'not_found':
          return c.json({ error: result.value.error.message }, 404)
        case 'invalid_transition':
          return c.json({ error: result.value.error.message }, 409)
        case 'success': {
          const standup = result.value.standup
          void notifyStandupStatusChanged({
            botInternalUrl: opts.botInternalUrl,
            internalSecret: opts.internalSecret,
            standupId: standup.id,
            newStatus: 'approved',
          })
          return c.json({ data: standup }, 200)
        }
      }
    },
  )
}
