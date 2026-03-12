import type { Hono } from 'hono'
import { registerTriggerWeeklyDigestRoute } from './trigger.js'

export interface DigestRoutesDeps {
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Registra todas as rotas de digests no app Hono fornecido.
 */

export function registerDigestRoutes(
  app: Hono<any>,
  opts: DigestRoutesDeps,
): void {
  registerTriggerWeeklyDigestRoute(app, opts)
}
