import { Injectable } from '@nestjs/common'
import type { Attributes } from '@opentelemetry/api'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { TraceService } from 'nestjs-otel'

@Injectable()
export class AppTracingService {
  constructor(private readonly traceService: TraceService) {}

  async withSpan<T>(
    name: string,
    attributes: Attributes,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.traceService
      .getTracer()
      .startActiveSpan(name, { attributes }, async (span) => {
        try {
          return await fn()
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

  markCurrentSpanError(message: string): void {
    const span = trace.getActiveSpan()
    if (!span) {
      return
    }

    span.setStatus({ code: SpanStatusCode.ERROR, message })
    span.addEvent('error', { 'error.message': message })
  }
}
