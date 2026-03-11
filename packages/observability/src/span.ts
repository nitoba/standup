import type { Attributes } from '@opentelemetry/api'
import { SpanStatusCode, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('@standup/observability')

/**
 * Marks the currently active span as ERROR and adds an error event.
 *
 * Use this inside Hono middleware or handlers to surface business-level
 * errors (Result.err, 4xx responses) that never throw exceptions — those
 * would otherwise stay as UNSET in Jaeger even when the response is an error.
 *
 * @param message  Human-readable error description (shown as span event in Jaeger)
 */
export function markActiveSpanError(message: string): void {
  const span = trace.getActiveSpan()
  if (!span) return
  span.setStatus({ code: SpanStatusCode.ERROR, message })
  span.addEvent('error', { 'error.message': message })
}

/**
 * Wraps an async function in an OpenTelemetry span.
 * Use this for manual instrumentation of critical pipeline steps.
 *
 * @example
 * const result = await withSpan('standup.git.collect', { repos: 3 }, async () => {
 *   return collectGitActivity(options)
 * })
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn()
      return result
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      if (error instanceof Error) {
        span.recordException(error)
      }
      throw error
    } finally {
      span.end()
    }
  })
}
