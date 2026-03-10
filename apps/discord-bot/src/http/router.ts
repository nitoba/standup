import { httpInstrumentationMiddleware } from '@hono/otel'
import type { Client } from 'discord.js'
import { Hono } from 'hono'
import { internalAuthMiddleware } from './middleware/auth.js'
import { registerJobFailedRoute } from './routes/job-failed.js'
import { registerLoginCompleteRoute } from './routes/login-complete.js'
import { registerStandupReadyRoute } from './routes/standup-ready.js'
import { registerStandupReminderRoute } from './routes/standup-reminder.js'
import { registerStandupStatusChangedRoute } from './routes/standup-status-changed.js'
import { registerUserDmRoute } from './routes/user-dm.js'

export interface InternalRouterOptions {
  internalSecret: string
  databaseUrl: string
  /** Cliente Discord unificado — mesmo Client do gateway (index.ts). */
  client: Client
  /** Canal Discord onde publicar standups e notificações de falha. */
  discordChannelId: string
  /** URL interna do worker — usada pelo reminder-handler para snooze/cancel. */
  workerInternalUrl: string
}

/**
 * Monta o roteador Hono com as rotas internas do discord-bot.
 * Todas as rotas /internal/* exigem autenticação via x-internal-secret.
 * Cada rota delega para seu handler específico, que chama o service correspondente.
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  app.use(
    '*',
    httpInstrumentationMiddleware({ serviceName: 'standup-discord-bot' }),
  )

  // Health — sem autenticação, acessível por Docker/Kamal healthcheck
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'discord-bot',
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  )

  // Auth middleware — todas as rotas /internal/* exigem o secret
  app.use('/internal/*', internalAuthMiddleware(opts.internalSecret))

  registerStandupReadyRoute(app, opts)
  registerJobFailedRoute(app, opts)
  registerUserDmRoute(app, opts)
  registerStandupReminderRoute(app, opts)
  registerLoginCompleteRoute(app, opts)
  registerStandupStatusChangedRoute(app, opts)

  return app
}
