import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import {
  handleStandupStatusChanged,
  standupStatusChangedBodySchema,
} from '../notify/standup-status-changed.js'

export function registerStandupStatusChangedRoute(
  app: Hono,
  opts: { databaseUrl: string; client: Client; discordChannelId: string },
): void {
  app.post(
    '/internal/notify/standup-status-changed',
    sValidator('json', standupStatusChangedBodySchema),
    (c) => handleStandupStatusChanged(c, c.req.valid('json'), opts),
  )
}
