import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import {
  handleStandupReminder,
  standupReminderBodySchema,
} from '../notify/standup-reminder.js'

export function registerStandupReminderRoute(
  app: Hono,
  opts: { client: Client; workerInternalUrl: string; internalSecret: string },
): void {
  app.post(
    '/internal/notify/standup-reminder',
    sValidator('json', standupReminderBodySchema),
    (c) => handleStandupReminder(c, c.req.valid('json'), opts),
  )
}
