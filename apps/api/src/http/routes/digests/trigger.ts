import { sValidator } from '@hono/standard-validator'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import z from 'zod'
import { triggerWeeklyDigestJob } from '../../../services/worker-client.js'
import { getUserId } from '../../utils/get-user-id.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'digest-trigger',
})

export interface DigestTriggerDeps {
  workerInternalUrl: string
  internalSecret: string
}

const bodySchema = z.object({
  userId: z.uuid().optional(),
})

/**
 * POST /digests/trigger
 * Trigger manual do weekly digest. userId vem da sessão (Better Auth) ou do body (internal calls).
 */

export function registerTriggerWeeklyDigestRoute(
  app: Hono<any>,
  opts: DigestTriggerDeps,
): void {
  app.post('/digests/trigger', sValidator('json', bodySchema), async (c) => {
    // Session user (web) or body userId (internal call via x-internal-secret)
    const { userId } = c.req.valid('json') ?? getUserId(c)

    if (!userId) {
      return c.json({ error: 'Could not resolve userId' }, 400)
    }

    const result = await triggerWeeklyDigestJob(
      {
        workerInternalUrl: opts.workerInternalUrl,
        internalSecret: opts.internalSecret,
      },
      userId,
    )

    if (result.isErr()) {
      logger.error('Failed to trigger weekly digest job on worker', {
        error: result.error.message,
      })
      return c.json({ error: 'Worker unavailable' }, 503)
    }

    return c.json({ ok: true, accepted: true }, 202)
  })
}
