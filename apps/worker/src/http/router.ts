import { Hono } from 'hono'
import type { ReminderState } from '../scheduler.js'
import { internalAuthMiddleware } from './middleware/auth.js'
import { handleCancelReminder } from './reminder/cancel.js'
import { handleSnoozeReminder } from './reminder/snooze.js'
import type { StandupJobOptions } from './trigger/standup.js'
import { handleTriggerStandup } from './trigger/standup.js'

export interface InternalRouterOptions {
  internalSecret: string
  triggerStandupJob: (options?: StandupJobOptions) => Promise<void>
  reminderState: ReminderState
}

/**
 * Rotas internas do worker.
 * Expostas para integração interna (api -> worker, discord-bot -> worker),
 * nunca para internet pública.
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  app.use('/internal/*', internalAuthMiddleware(opts.internalSecret))

  app.post('/internal/trigger/standup', (c) => {
    return handleTriggerStandup(c, {
      triggerStandupJob: opts.triggerStandupJob,
    })
  })

  app.post('/internal/reminder/snooze', (c) => {
    return handleSnoozeReminder(c, opts.reminderState)
  })

  app.post('/internal/reminder/cancel', (c) => {
    return handleCancelReminder(c, opts.reminderState)
  })

  return app
}
