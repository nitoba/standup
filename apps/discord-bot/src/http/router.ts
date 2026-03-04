import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import { Hono } from 'hono'
import { internalAuthMiddleware } from './middleware/auth.js'
import { handleJobFailed, jobFailedBodySchema } from './notify/job-failed.js'
import {
  handleStandupReady,
  standupReadyBodySchema,
} from './notify/standup-ready.js'

export interface InternalRouterOptions {
  internalSecret: string
  databaseUrl: string
  /** Cliente Discord unificado — mesmo Client do gateway (index.ts). */
  client: Client
  /** Discord User ID para DMs de revisão. */
  discordUserId: string
  /** Canal Discord onde publicar standups e notificações de falha. */
  discordChannelId: string
}

/**
 * Monta o roteador Hono com as rotas internas do discord-bot.
 * Todas as rotas /internal/* exigem autenticação via x-internal-secret.
 * Cada rota delega para seu handler específico, que chama o service correspondente.
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  // Auth middleware — todas as rotas /internal/* exigem o secret
  app.use('/internal/*', internalAuthMiddleware(opts.internalSecret))

  // POST /internal/notify/standup-ready
  app.post(
    '/internal/notify/standup-ready',
    sValidator('json', standupReadyBodySchema),
    (c) =>
      handleStandupReady(c, c.req.valid('json'), {
        databaseUrl: opts.databaseUrl,
        client: opts.client,
        discordUserId: opts.discordUserId,
      }),
  )

  // POST /internal/notify/job-failed
  app.post(
    '/internal/notify/job-failed',
    sValidator('json', jobFailedBodySchema),
    (c) =>
      handleJobFailed(c, c.req.valid('json'), {
        client: opts.client,
        discordChannelId: opts.discordChannelId,
      }),
  )

  return app
}
