import type { Hono } from 'hono'
import type { AppContext } from '../../types.js'
import { registerTriggerWeeklyDigestRoute } from './trigger.js'

export interface DigestRoutesDeps {
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Registra todas as rotas de digests no app Hono fornecido.
 */

export function registerDigestRoutes(
  app: Hono<AppContext>,
  opts: DigestRoutesDeps,
): void {
  registerTriggerWeeklyDigestRoute(app, opts)
}
