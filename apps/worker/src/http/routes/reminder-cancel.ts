import type { Hono } from 'hono'
import { handleCancelReminder } from '../../handlers/reminder-cancel.js'

export function registerReminderCancelRoute(
  app: Hono,
  opts: { databaseUrl: string },
): void {
  app.post('/internal/reminder/cancel', (c) =>
    handleCancelReminder(c, { databaseUrl: opts.databaseUrl }),
  )
}
