import { sValidator } from '@hono/standard-validator'
import type { Client } from 'discord.js'
import type { Hono } from 'hono'
import { handleJobFailed, jobFailedBodySchema } from '../notify/job-failed.js'

export function registerJobFailedRoute(
  app: Hono,
  opts: { client: Client; discordChannelId: string },
): void {
  app.post(
    '/internal/notify/job-failed',
    sValidator('json', jobFailedBodySchema),
    (c) => handleJobFailed(c, c.req.valid('json'), opts),
  )
}
