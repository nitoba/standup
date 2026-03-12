import { sValidator } from '@hono/standard-validator'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import z from 'zod'
import type { WeeklyDigestJobOptions } from '../../job/weekly-digest-job.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-weekly-digest',
})

const bodySchema = z.object({
  userId: z.string().min(1),
})

/**
 * POST /internal/trigger/weekly-digest
 *
 * Dispara o job em background e retorna imediatamente (202 Accepted).
 */
export function registerTriggerWeeklyDigestRoute(
  app: Hono,
  opts: {
    triggerWeeklyDigestJob: (options: WeeklyDigestJobOptions) => Promise<void>
  },
): void {
  app.post(
    '/internal/trigger/weekly-digest',
    sValidator('json', bodySchema),
    async (c) => {
      const startedAt = Date.now()
      const { userId } = c.req.valid('json')

      const dispatchResult = await Result.tryPromise({
        try: () => opts.triggerWeeklyDigestJob({ userId }),
        catch: (error) =>
          new ExternalServiceError({
            service: 'worker',
            message: `Failed to dispatch weekly digest trigger: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })

      if (dispatchResult.isErr()) {
        logger.error('Weekly digest trigger failed before dispatch', {
          error: dispatchResult.error.message,
        })
        return c.json({ error: 'Internal server error' }, 500)
      }

      logger.info('Weekly digest trigger accepted', {
        latencyMs: Date.now() - startedAt,
        userId,
      })
      return c.json({ ok: true, accepted: true }, 202)
    },
  )
}
