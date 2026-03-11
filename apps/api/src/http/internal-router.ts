import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { Hono } from 'hono'
import * as z from 'zod'
import type { EventBus } from '../sse/event-bus.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'internal-router',
})

const standupEventBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('standup_progress'),
    userId: z.string().min(1),
    runId: z.string().min(1),
    date: z.string().min(1),
    mode: z.enum(['generate', 'regenerate', 'adjust']),
    step: z.enum([
      'queued',
      'collecting_git',
      'enriching_data',
      'generating_standup',
      'saving_draft',
      'notifying_review',
      'completed',
      'no_activity',
    ]),
    message: z.string().min(1),
    standupId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('standup_generated'),
    userId: z.string().min(1),
    runId: z.string().min(1),
    standupId: z.string().min(1),
    date: z.string().min(1),
    mode: z.enum(['generate', 'regenerate', 'adjust']),
  }),
  z.object({
    type: z.literal('standup_failed'),
    userId: z.string().min(1),
    runId: z.string().min(1),
    date: z.string().min(1),
    mode: z.enum(['generate', 'regenerate', 'adjust']),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('standup_status_changed'),
    userId: z.string().min(1),
    standupId: z.string().min(1),
    newStatus: z.string().min(1),
  }),
])

/**
 * Internal HTTP router — only reachable from trusted processes (worker).
 * All routes under /internal/* are protected by x-internal-secret.
 */
export function createInternalRouter(opts: {
  internalSecret: string
  eventBus: EventBus
}): Hono {
  const app = new Hono()

  async function handleStandupEvent(c: Context): Promise<Response> {
    const body = await c.req.json().catch(() => null)
    const parsed = standupEventBodySchema.safeParse(body)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return c.json(
        { error: `Invalid body: ${issue?.message ?? 'unknown'}` },
        400,
      )
    }

    const { userId, ...event } = parsed.data

    logger.info('Pushing standup SSE event', {
      userId,
      eventType: event.type,
      ...('runId' in event ? { runId: event.runId } : {}),
      ...('date' in event ? { date: event.date } : {}),
      ...(event.type === 'standup_progress' ? { step: event.step } : {}),
      ...(event.type === 'standup_generated' ||
      event.type === 'standup_status_changed'
        ? { standupId: event.standupId }
        : {}),
    })

    opts.eventBus.emit(userId, event)

    return c.json({ ok: true })
  }

  // Auth middleware for all internal routes
  app.use('/internal/*', async (c, next) => {
    const secret = c.req.header('x-internal-secret')
    if (secret !== opts.internalSecret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  })

  /**
   * POST /internal/events/standup
   *
   * Called by the worker during the standup job lifecycle.
   * Pushes coarse-grained SSE events to the connected web client for this userId.
   */
  app.post('/internal/events/standup', handleStandupEvent)

  return app
}
