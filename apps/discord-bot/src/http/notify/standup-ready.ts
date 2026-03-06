import { DbError, NotFoundError } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { notifyStandupReady } from '../../services/standup-notification-service.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-standup-ready',
})

export const standupReadyBodySchema = z.object({
  standupId: z.string().min(1),
})

export type StandupReadyBody = z.infer<typeof standupReadyBodySchema>

export interface StandupReadyHandlerDeps {
  databaseUrl: string
  client: Client
  discordUserId: string
}

/**
 * Handler para POST /internal/notify/standup-ready.
 * Disparado pelo worker quando um standup draft foi salvo.
 * Delega para notifyStandupReady: busca standup, envia DM, transiciona status.
 */
export async function handleStandupReady(
  c: Context,
  body: StandupReadyBody,
  deps: StandupReadyHandlerDeps,
): Promise<Response> {
  const { standupId } = body

  const result = await notifyStandupReady(standupId, {
    databaseUrl: deps.databaseUrl,
    client: deps.client,
    discordUserId: deps.discordUserId,
  })

  if (result.isErr()) {
    if (NotFoundError.is(result.error)) {
      return c.json(
        { error: `Standup not found: ${standupId}` },
        404,
      ) as Response
    }

    if (DbError.is(result.error)) {
      logger.error('DB error fetching standup', {
        standupId,
        error: result.error.message,
      })

      return c.json({ error: 'Internal server error' }, 500)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }

  return c.json({ ok: true, standupId: result.value.standupId })
}
