import type { Hono } from 'hono'
import type { EventBus } from '../../sse/event-bus.js'
import { handleStandupEvents } from '../../sse/sse-handler.js'
import { registerApproveStandupRoute } from './approve.js'
import { registerGetStandupByIdRoute } from './get-by-id.js'
import { registerListStandupsRoute } from './list.js'
import { registerTriggerStandupRoute } from './trigger.js'
import { registerUpdateStandupStatusRoute } from './update-status.js'

export interface StandupRoutesDeps {
  databaseUrl: string
  reposRootPath: string
  workerInternalUrl: string
  internalSecret: string
  botInternalUrl: string
  eventBus: EventBus
}

/**
 * Registra todas as rotas de standup no app Hono fornecido.
 * Ordem importa: /standups/events ANTES de /standups/:id.
 */
export function registerStandupRoutes(
  app: Hono<any>,
  opts: StandupRoutesDeps,
): void {
  // List must come before /:id to avoid param capture
  registerListStandupsRoute(app, { databaseUrl: opts.databaseUrl })

  // SSE — must come before /:id
  app.get('/standups/events', (c) => handleStandupEvents(c, opts.eventBus))

  registerGetStandupByIdRoute(app, { databaseUrl: opts.databaseUrl })

  registerUpdateStandupStatusRoute(app, {
    databaseUrl: opts.databaseUrl,
    botInternalUrl: opts.botInternalUrl,
    internalSecret: opts.internalSecret,
  })

  registerApproveStandupRoute(app, {
    databaseUrl: opts.databaseUrl,
    botInternalUrl: opts.botInternalUrl,
    internalSecret: opts.internalSecret,
  })

  registerTriggerStandupRoute(app, {
    databaseUrl: opts.databaseUrl,
    reposRootPath: opts.reposRootPath,
    workerInternalUrl: opts.workerInternalUrl,
    internalSecret: opts.internalSecret,
  })
}
