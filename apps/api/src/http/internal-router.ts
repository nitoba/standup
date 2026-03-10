import { createServiceLogger } from '@standup/logger'
import { Hono } from 'hono'
import * as z from 'zod'
import type { EventBus } from '../sse/event-bus.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'internal-router',
})

const standupGeneratedBodySchema = z.object({
  userId: z.string().min(1),
  standupId: z.string().min(1),
  date: z.string().min(1),
})

/**
 * Internal HTTP router — only reachable from trusted processes (worker).
 * All routes under /internal/* are protected by x-internal-secret.
 */
export function createInternalRouter(opts: {
  internalSecret: string
  eventBus: EventBus
}): Hono {
  const app = new Hono()

  // Auth middleware for all internal routes
  app.use('/internal/*', async (c, next) => {
    const secret = c.req.header('x-internal-secret')
    if (secret !== opts.internalSecret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  })

  /**
   * POST /internal/events/standup-generated
   *
   * Called by the worker after a standup is persisted.
   * Pushes an SSE event to the connected web client for this userId.
   */
  app.post('/internal/events/standup-generated', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = standupGeneratedBodySchema.safeParse(body)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return c.json(
        { error: `Invalid body: ${issue?.message ?? 'unknown'}` },
        400,
      )
    }

    const { userId, standupId, date } = parsed.data

    logger.info('Pushing standup_generated SSE event', {
      userId,
      standupId,
      date,
    })

    opts.eventBus.emit(userId, { type: 'standup_generated', standupId, date })

    return c.json({ ok: true })
  })

  return app
}
