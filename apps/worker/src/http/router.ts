import { Hono } from 'hono'
import { internalAuthMiddleware } from './middleware/auth.js'
import type { StandupJobOptions } from './trigger/standup.js'
import { handleTriggerStandup } from './trigger/standup.js'

export interface InternalRouterOptions {
  internalSecret: string
  triggerStandupJob: (options?: StandupJobOptions) => Promise<void>
}

/**
 * Rotas internas do worker.
 * Expostas para integração interna (api -> worker), nunca para internet pública.
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  app.use('/internal/*', internalAuthMiddleware(opts.internalSecret))

  app.post('/internal/trigger/standup', (c) => {
    return handleTriggerStandup(c, {
      triggerStandupJob: opts.triggerStandupJob,
    })
  })

  return app
}
