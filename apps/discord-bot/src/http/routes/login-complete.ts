import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import {
  handleLoginComplete,
  loginCompleteBodySchema,
} from '../notify/login-complete.js'

export function registerLoginCompleteRoute(
  app: Hono,
  opts: { client: Client },
): void {
  app.post(
    '/internal/notify/login-complete',
    sValidator('json', loginCompleteBodySchema),
    (c) => handleLoginComplete(c, c.req.valid('json'), opts),
  )
}
