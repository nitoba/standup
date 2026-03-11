import type { Hono } from 'hono'
import {
  handleTriggerWeeklyDigest,
  type TriggerWeeklyDigestHandlerDeps,
} from '../../handlers/trigger-weekly-digest.js'

export function registerTriggerWeeklyDigestRoute(
  app: Hono,
  opts: TriggerWeeklyDigestHandlerDeps,
): void {
  app.post('/internal/trigger/weekly-digest', (c) =>
    handleTriggerWeeklyDigest(c, {
      triggerWeeklyDigestJob: opts.triggerWeeklyDigestJob,
    }),
  )
}
