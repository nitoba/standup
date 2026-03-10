import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'

const tracer = trace.getTracer('@standup/observability')

/**
 * Instrumented fetch wrapper that creates a CLIENT span and propagates
 * trace context (traceparent header) to downstream services.
 *
 * Drop-in replacement for `fetch()` in inter-service HTTP calls.
 * When tracing is disabled (no provider registered), behaves like regular fetch.
 */
export async function tracedFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const urlString = typeof url === 'string' ? url : url.toString()
  const method = init?.method ?? 'GET'

  // Parse just the pathname for span name (avoid leaking full URL with secrets)
  let pathname: string
  try {
    pathname = new URL(urlString).pathname
  } catch {
    pathname = urlString
  }

  return tracer.startActiveSpan(
    `${method} ${pathname}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.full': urlString,
      },
    },
    async (span) => {
      // Inject traceparent into outgoing headers
      const headers = new Headers(init?.headers)
      propagation.inject(context.active(), headers, {
        set: (carrier, key, value) => carrier.set(key, value),
      })

      try {
        const response = await fetch(urlString, { ...init, headers })

        span.setAttribute('http.response.status_code', response.status)
        if (response.status >= 400) {
          span.setStatus({ code: SpanStatusCode.ERROR })
        }

        return response
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR })
        if (error instanceof Error) {
          span.recordException(error)
        }
        throw error
      } finally {
        span.end()
      }
    },
  )
}
