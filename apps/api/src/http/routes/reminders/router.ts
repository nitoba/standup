import type { Hono } from 'hono'
import { registerCancelTodayReminderRoute } from './cancel-today.js'
import { registerRunNowReminderRoute } from './run-now.js'
import { registerSnoozeReminderRoute } from './snooze.js'

export interface RemindersRoutesDeps {
  databaseUrl: string
  reposRootPath: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Registra todas as rotas de reminders no app Hono fornecido.
 */

export function registerRemindersRoutes(
  app: Hono<any>,
  opts: RemindersRoutesDeps,
): void {
  registerRunNowReminderRoute(app, {
    databaseUrl: opts.databaseUrl,
    reposRootPath: opts.reposRootPath,
    workerInternalUrl: opts.workerInternalUrl,
    internalSecret: opts.internalSecret,
  })
  registerSnoozeReminderRoute(app, {
    workerInternalUrl: opts.workerInternalUrl,
    internalSecret: opts.internalSecret,
  })
  registerCancelTodayReminderRoute(app, {
    workerInternalUrl: opts.workerInternalUrl,
    internalSecret: opts.internalSecret,
  })
}
