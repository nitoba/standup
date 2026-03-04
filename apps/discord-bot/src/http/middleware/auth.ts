import type { MiddlewareHandler } from 'hono'

/**
 * Middleware de autenticação interna.
 * Todas as rotas /internal/* exigem o header x-internal-secret correspondente.
 * Retorna 401 se ausente ou incorreto.
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
