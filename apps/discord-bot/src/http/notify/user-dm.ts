import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { EMBED_COLORS } from '../../discord/embeds.js'
import { sendUserDm } from '../../discord/notifications/send-user-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-user-dm',
})

export const userDmBodySchema = z.object({
  discordUserId: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  color: z.number().int().optional(),
})

export type UserDmBody = z.infer<typeof userDmBodySchema>

export interface UserDmHandlerDeps {
  client: Client
}

/**
 * Handler para POST /internal/notify/user-dm.
 * Envia uma DM informativa direta ao usuário Discord.
 * Usado pelo worker para notificar: nenhuma atividade, job já em andamento, etc.
 * Retorna 200 sempre — falha de DM é non-fatal para o worker.
 */
export async function handleUserDm(
  c: Context,
  body: UserDmBody,
  deps: UserDmHandlerDeps,
): Promise<Response> {
  logger.info('Received user DM notification request', {
    discordUserId: body.discordUserId,
    title: body.title,
  })

  const result = await sendUserDm({
    client: deps.client,
    discordUserId: body.discordUserId,
    title: body.title,
    message: body.message,
    color: body.color ?? EMBED_COLORS.REVIEW,
  })

  if (result.isErr()) {
    logger.warn('Failed to send user DM', {
      discordUserId: body.discordUserId,
      title: body.title,
      error: result.error.message,
    })
    // Non-fatal: retorna 200 mesmo em falha para não bloquear o worker
    return c.json({ ok: false, reason: result.error.message }) as Response
  }

  return c.json({ ok: true })
}
