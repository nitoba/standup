import { sValidator } from '@hono/standard-validator'
import type {
  ExternalServiceError,
  Result,
  StandupRecord,
} from '@standup/domain'
import { Hono } from 'hono'
import { approveBodySchema, handleApproveStandup } from './approve.js'
import { handleGetStandupById } from './get-by-id.js'
import { handleListStandups, listQuerySchema } from './list.js'
import { handleTriggerStandup, triggerBodySchema } from './trigger.js'
import {
  handleUpdateStandupStatus,
  updateStatusBodySchema,
} from './update-status.js'

export interface StandupRouterDeps {
  databaseUrl: string
  reposRootPath: string
  workerInternalUrl: string
  internalSecret: string
  publishApprovedStandup?: (
    record: StandupRecord,
  ) => Promise<Result<void, ExternalServiceError>>
}

/**
 * Extracts userId from the Hono context.
 * For session-authenticated requests, userId comes from Better Auth session.
 * For internal calls (x-internal-secret), userId must be passed in the request body.
 */
function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return user?.id as string | undefined
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
    const userId = getUserId(c)
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return handleListStandups(c, c.req.valid('query'), deps.databaseUrl, userId)
  })

  // GET /standups/:id — detalhe por ID
  app.get('/standups/:id', async (c) => {
    const userId = getUserId(c)
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return handleGetStandupById(c, c.req.param('id'), deps.databaseUrl, userId)
  })

  // PATCH /standups/:id/status — transições diretas/rejeição (aprovação tem rota dedicada)
  app.patch(
    '/standups/:id/status',
    sValidator('json', updateStatusBodySchema),
    async (c) => {
      const userId = getUserId(c)
      if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      return handleUpdateStandupStatus(
        c,
        c.req.param('id'),
        c.req.valid('json'),
        deps.databaseUrl,
        userId,
      )
    },
  )

  // POST /standups/:id/approve — fluxo dedicado de aprovação + publicação
  app.post(
    '/standups/:id/approve',
    sValidator('json', approveBodySchema),
    async (c) => {
      const userId = getUserId(c)
      if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      return handleApproveStandup(
        c,
        c.req.param('id'),
        c.req.valid('json'),
        {
          databaseUrl: deps.databaseUrl,
          publishApprovedStandup: deps.publishApprovedStandup,
        },
        userId,
      )
    },
  )

  // POST /standups/trigger — trigger manual autenticado por sessão
  app.post('/standups/trigger', sValidator('json', triggerBodySchema), (c) => {
    return handleTriggerStandup(c, c.req.valid('json'), {
      databaseUrl: deps.databaseUrl,
      reposRootPath: deps.reposRootPath,
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    })
  })

  return app
}
