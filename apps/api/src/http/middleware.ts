import { createServiceLogger, withContext } from '@standup/logger'
import { markActiveSpanError } from '@standup/observability'
import type { MiddlewareHandler } from 'hono'

type Logger = ReturnType<typeof createServiceLogger>

/**
 * Middleware de logging de requisições HTTP.
 * Injeta requestId no contexto Hono e loga início/fim de cada request.
 * O requestId é propagado via header x-request-id para rastreabilidade.
 */
export function requestLogger(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID()
    const startedAt = Date.now()

    c.set('requestId', requestId)
    c.header('x-request-id', requestId)

    const reqLogger = withContext(logger, {
      requestId,
      method: c.req.method,
      path: c.req.path,
    })

    reqLogger.info('Request started')

    try {
      await next()
      reqLogger.info('Request completed', {
        statusCode: c.res.status,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      reqLogger.error('Request failed before response', {
        durationMs: Date.now() - startedAt,
        error,
      })
      throw error
    }
  }
}

/**
 * Middleware de status de span para OpenTelemetry.
 *
 * O @hono/otel só marca o span como ERROR para status >= 500 ou exceções
 * lançadas. Respostas 4xx retornadas via c.json() (padrão Result, sem throw)
 * ficam com status UNSET no Jaeger — invisíveis como erros.
 *
 * Este middleware cobre o gap: para qualquer resposta >= 400, marca o span
 * ativo como ERROR e adiciona um span event com a mensagem de erro extraída
 * do corpo JSON `{ error: "..." }`.
 *
 * Deve ser registrado APÓS httpInstrumentationMiddleware (para que o span
 * esteja ativo) e APÓS requestLogger (não depende de requestId).
 */
export function spanStatusMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    const status = c.res.status
    if (status < 400) return

    // Tenta extrair a mensagem do corpo JSON sem consumir a resposta original.
    // A maioria dos handlers retorna { error: "..." } — se não conseguir, usa
    // o status HTTP como mensagem.
    let message = `HTTP ${status}`
    try {
      const body = (await c.res.clone().json()) as { error?: string }
      if (typeof body?.error === 'string' && body.error.length > 0) {
        message = body.error
      }
    } catch {
      // corpo não é JSON ou já foi consumido — usa só o status
    }

    markActiveSpanError(message)
  }
}
