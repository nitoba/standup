import type { AzureMcpClient } from '@standup/azure-devops'
import { Hono } from 'hono'
import { internalAuthMiddleware } from './middleware/auth.js'
import { handleCancelReminder } from './reminder/cancel.js'
import { handleSnoozeReminder } from './reminder/snooze.js'
import { handleListRepos } from './repos/list.js'
import type { StandupJobOptions } from './trigger/standup.js'
import { handleTriggerStandup } from './trigger/standup.js'

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

  app.post('/internal/trigger/standup', (c) => {
    return handleTriggerStandup(c, {
      triggerStandupJob: opts.triggerStandupJob,
    })
  })

  app.post('/internal/reminder/snooze', (c) => {
    return handleSnoozeReminder(c, { databaseUrl: opts.databaseUrl })
  })

  app.post('/internal/reminder/cancel', (c) => {
    return handleCancelReminder(c, { databaseUrl: opts.databaseUrl })
  })

  app.get('/internal/repos/list', (c) => {
    return handleListRepos(c, {
      mcpClient: opts.mcpClient,
      projects: opts.azureProjects,
    })
  })

  return app
}
