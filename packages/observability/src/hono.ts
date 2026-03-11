import type { MiddlewareHandler } from 'hono'
import { markActiveSpanError } from './span.js'

/**
 * Hono middleware that marks the active OTel span as ERROR for any HTTP
 * response with status >= 400.
 *
 * Problem it solves:
 *   `@hono/otel` only sets SpanStatusCode.ERROR for status >= 500 or thrown
 *   exceptions. Handlers that use the Result pattern — returning
 *   `c.json({ error: '...' }, 4xx)` without throwing — leave the span with
 *   status UNSET, making them invisible as errors in Jaeger.
 *
 * How it works:
 *   After `next()` the middleware reads `c.res.status`. For any >= 400 it
 *   clones the response body (without consuming the original), tries to
 *   extract the `{ error: "..." }` message, and calls `markActiveSpanError`.
 *
 * Registration order:
 *   Must be registered AFTER `httpInstrumentationMiddleware` so the SERVER
 *   span is already active when this runs.
 *
 * @example
 * app.use('*', httpInstrumentationMiddleware({ serviceName: 'my-service' }))
 * app.use('*', spanStatusMiddleware())
 */
export function spanStatusMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    const status = c.res.status
    if (status < 400) return

    // Try to extract the human-readable error from JSON body without
    // consuming the original response stream.
    let message = `HTTP ${status}`
    try {
      const body = (await c.res.clone().json()) as { error?: string }
      if (typeof body?.error === 'string' && body.error.length > 0) {
        message = body.error
      }
    } catch {
      // Body is not JSON or already consumed — fall back to HTTP status.
    }

    markActiveSpanError(message)
  }
}
