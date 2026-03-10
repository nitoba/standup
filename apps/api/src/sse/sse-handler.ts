import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { EventBus } from './event-bus.js'

const logger = createServiceLogger({ service: 'api', component: 'sse-handler' })

const KEEPALIVE_INTERVAL_MS = 30_000

/**
 * GET /standups/events
 *
 * Opens an SSE stream for the authenticated user.
 * The client receives:
 *   - A 'connected' ping immediately upon connection
 *   - 'standup_generated' events when a new standup is ready for review
 *   - 'ping' keepalive events every 30s to keep the connection alive
 *
 * The EventBus is used to push events from other parts of the API process.
 */
export async function handleStandupEvents(
  c: Context,
  eventBus: EventBus,
): Promise<Response> {
  const userId = (c.get('user') as Record<string, unknown> | undefined)?.id as
    | string
    | undefined

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  logger.info('SSE connection opened', { userId })

  return streamSSE(c, async (stream) => {
    // Send initial connected event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ ok: true }),
    })

    // Keepalive timer
    let keepaliveTimer: ReturnType<typeof setInterval> | undefined

    const cleanup = eventBus.subscribe(userId, (event) => {
      stream
        .writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        })
        .catch((err: unknown) => {
          logger.warn('SSE write failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    })

    keepaliveTimer = setInterval(() => {
      stream
        .writeSSE({ event: 'ping', data: JSON.stringify({ ts: Date.now() }) })
        .catch((err: unknown) => {
          logger.warn('SSE keepalive write failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }, KEEPALIVE_INTERVAL_MS)

    // Keep the stream open until the client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        cleanup()
        clearInterval(keepaliveTimer)
        logger.info('SSE connection closed', { userId })
        resolve()
      })
    })
  })
}
