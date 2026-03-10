import { DbError, NotFoundError, StandupStatusSchema } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { syncStandupStatus } from '../../services/standup-sync-service.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'standup-status-changed-handler',
})

export const standupStatusChangedBodySchema = z.object({
  standupId: z.string().min(1),
  newStatus: StandupStatusSchema,
})

export type StandupStatusChangedBody = z.infer<
  typeof standupStatusChangedBodySchema
>

export interface StandupStatusChangedHandlerDeps {
  databaseUrl: string
  client: Client
  discordChannelId: string
}

export async function handleStandupStatusChanged(
  c: Context,
  body: StandupStatusChangedBody,
  deps: StandupStatusChangedHandlerDeps,
): Promise<Response> {
  logger.info('Received standup-status-changed notification', {
    standupId: body.standupId,
    newStatus: body.newStatus,
  })

  // Fire-and-forget em background — responde imediatamente ao caller (API)
  void syncStandupStatus(
    { standupId: body.standupId, newStatus: body.newStatus },
    {
      databaseUrl: deps.databaseUrl,
      client: deps.client,
      discordChannelId: deps.discordChannelId,
    },
  ).then((result) => {
    if (result.isErr()) {
      const error = result.error
      if (NotFoundError.is(error)) {
        logger.warn('Standup not found during status sync', {
          standupId: body.standupId,
          error: error.message,
        })
      } else if (DbError.is(error)) {
        logger.error('DB error during standup status sync', {
          standupId: body.standupId,
          error: error.message,
        })
      } else {
        logger.warn('External service error during standup status sync', {
          standupId: body.standupId,
          error: error.message,
        })
      }
    }
  })

  return c.json({ ok: true })
}
