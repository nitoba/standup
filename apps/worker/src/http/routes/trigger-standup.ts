import type { Hono } from 'hono'
import {
  handleTriggerStandup,
  type StandupJobOptions,
} from '../../handlers/trigger-standup.js'

export function registerTriggerStandupRoute(
  app: Hono,
  opts: { triggerStandupJob: (options: StandupJobOptions) => Promise<void> },
): void {
  app.post('/internal/trigger/standup', (c) =>
    handleTriggerStandup(c, { triggerStandupJob: opts.triggerStandupJob }),
  )
}
