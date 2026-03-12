import { createServiceLogger, withContext } from '@standup/logger'
import type { MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'

type Logger = ReturnType<typeof createServiceLogger>

/**
 * Middleware de logging de requisições HTTP.
 * Injeta requestId no contexto Hono e loga início/fim de cada request.
 * O requestId é propagado via header x-request-id para rastreabilidade.
 */
export function useRequestLogger(logger: Logger): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
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
  })
}
