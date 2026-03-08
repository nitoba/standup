import type { Hono } from 'hono'
import { handleSnoozeReminder } from '../../handlers/reminder-snooze.js'

export function registerReminderSnoozeRoute(
  app: Hono,
  opts: { databaseUrl: string },
): void {
  app.post('/internal/reminder/snooze', (c) =>
    handleSnoozeReminder(c, { databaseUrl: opts.databaseUrl }),
  )
}
