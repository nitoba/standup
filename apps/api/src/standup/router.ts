import { sValidator } from '@hono/standard-validator'
import { Hono } from 'hono'
import { handleGetStandupById } from './get-by-id.js'
import { handleListStandups, listQuerySchema } from './list.js'
import { handleTriggerStandup, triggerBodySchema } from './trigger.js'
import {
  handleUpdateStandupStatus,
  updateStatusBodySchema,
} from './update-status.js'

export interface StandupRouterDeps {
  databaseUrl: string
  allowedDiscordUserId: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Monta o router Hono com as rotas de standup.
 * Cada rota delega para seu handler específico, que por sua vez
 * chama o service com a lógica de negócio.
 */
export function createStandupRouter(deps: StandupRouterDeps): Hono {
  const app = new Hono()

  // GET /standups — lista com filtros opcionais ?status= e ?date=
  app.get('/standups', sValidator('query', listQuerySchema), async (c) => {
    return handleListStandups(c, c.req.valid('query'), deps.databaseUrl)
  })

  // GET /standups/:id — detalhe por ID
  app.get('/standups/:id', async (c) => {
    return handleGetStandupById(c, c.req.param('id'), deps.databaseUrl)
  })

  // PATCH /standups/:id/status — aprovação manual (state machine valida transição)
  app.patch(
    '/standups/:id/status',
    sValidator('json', updateStatusBodySchema),
    async (c) => {
      return handleUpdateStandupStatus(
        c,
        c.req.param('id'),
        c.req.valid('json'),
        deps.databaseUrl,
      )
    },
  )

  // POST /standups/trigger — trigger manual autenticado por discordUserId
  app.post('/standups/trigger', sValidator('json', triggerBodySchema), (c) => {
    return handleTriggerStandup(c, c.req.valid('json'), {
      allowedDiscordUserId: deps.allowedDiscordUserId,
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    })
  })

  return app
}
