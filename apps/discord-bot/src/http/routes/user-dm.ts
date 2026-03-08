import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import { handleUserDm, userDmBodySchema } from '../notify/user-dm.js'

export function registerUserDmRoute(app: Hono, opts: { client: Client }): void {
  app.post(
    '/internal/notify/user-dm',
    sValidator('json', userDmBodySchema),
    (c) => handleUserDm(c, c.req.valid('json'), opts),
  )
}
