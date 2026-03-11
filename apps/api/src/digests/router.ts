import { Hono } from 'hono'
import { handleTriggerWeeklyDigest } from './trigger.js'

export interface DigestRouterDeps {
  workerInternalUrl: string
  internalSecret: string
}

export function createDigestRouter(deps: DigestRouterDeps): Hono {
  const app = new Hono()

  app.post('/trigger', (c) => handleTriggerWeeklyDigest(c, deps))

  return app
}
