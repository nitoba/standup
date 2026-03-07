import type { MiddlewareHandler } from 'hono'
import type { Auth } from './auth.js'

/**
 * Middleware Hono que valida a sessão do Better Auth.
 * Protege rotas que requerem autenticação via Discord OAuth.
 *
 * Rotas internas (x-internal-secret) passam direto — são chamadas
 * por serviços confiáveis (discord-bot, worker) que já têm auth própria.
 */
export function sessionAuthMiddleware(
  auth: Auth,
  internalSecret: string,
): MiddlewareHandler {
  return async (c, next) => {
    // Bypass: internal service-to-service calls (trusted)
    const internalHeader = c.req.header('x-internal-secret')
    if (internalHeader && internalHeader === internalSecret) {
      return next()
    }

    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', session.user)
    c.set('session', session.session)
    return next()
  }
}
