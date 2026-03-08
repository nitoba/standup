import type { AzureMcpClient } from '@standup/azure-devops'
import { Hono } from 'hono'
import type { StandupJobOptions } from '../handlers/trigger-standup.js'
import { internalAuthMiddleware } from './middleware/auth.js'
import { registerReminderCancelRoute } from './routes/reminder-cancel.js'
import { registerReminderSnoozeRoute } from './routes/reminder-snooze.js'
import { registerReposListRoute } from './routes/repos-list.js'
import { registerTriggerStandupRoute } from './routes/trigger-standup.js'

export interface InternalRouterOptions {
  internalSecret: string
  databaseUrl: string
  triggerStandupJob: (options: StandupJobOptions) => Promise<void>
  mcpClient: AzureMcpClient
  azureProjects: string[]
}

/**
 * Rotas internas do worker.
 * Expostas para integração interna (api -> worker, discord-bot -> worker),
 * nunca para internet pública.
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  // Health — sem autenticação, acessível por Docker/Kamal healthcheck
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'worker',
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  )

  app.use('/internal/*', internalAuthMiddleware(opts.internalSecret))

  registerTriggerStandupRoute(app, opts)
  registerReminderSnoozeRoute(app, opts)
  registerReminderCancelRoute(app, opts)
  registerReposListRoute(app, opts)

  return app
}
