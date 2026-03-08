import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import {
  handleStandupReady,
  standupReadyBodySchema,
} from '../notify/standup-ready.js'

export function registerStandupReadyRoute(
  app: Hono,
  opts: { databaseUrl: string; client: Client },
): void {
  app.post(
    '/internal/notify/standup-ready',
    sValidator('json', standupReadyBodySchema),
    (c) => handleStandupReady(c, c.req.valid('json'), opts),
  )
}
