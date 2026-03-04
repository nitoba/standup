import type { MiddlewareHandler } from 'hono'

/**
 * Middleware de autenticação interna para rotas do worker.
 * Exige header x-internal-secret para permitir trigger manual.
 */
export function internalAuthMiddleware(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const provided = c.req.header('x-internal-secret')
    if (!provided || provided !== secret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  }
}
