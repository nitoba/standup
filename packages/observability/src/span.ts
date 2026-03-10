import type { Attributes } from '@opentelemetry/api'
import { SpanStatusCode, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('@standup/observability')

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
