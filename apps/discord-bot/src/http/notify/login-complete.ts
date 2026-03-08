import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { sendLoginSuccessDm } from '../../discord/notifications/send-login-success-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-login-complete',
})

export const loginCompleteBodySchema = z.object({
  discordUserId: z.string().min(1),
})

export type LoginCompleteBody = z.infer<typeof loginCompleteBodySchema>

export interface LoginCompleteHandlerDeps {
  client: Client
}

/**
 * Handler para POST /internal/notify/login-complete.
 * Disparado pela API quando o OAuth callback cria uma nova sessão.
 * Envia DM ao usuario confirmando o login.
 * Retorna 200 mesmo em falha — non-fatal.
 */
export async function handleLoginComplete(
  c: Context,
  body: LoginCompleteBody,
  deps: LoginCompleteHandlerDeps,
): Promise<Response> {
  logger.info('Received login complete notification', {
    discordUserId: body.discordUserId,
  })

  const result = await sendLoginSuccessDm({
    client: deps.client,
    discordUserId: body.discordUserId,
  })

  if (result.isErr()) {
    logger.warn('Failed to send login success DM — non-fatal', {
      error: result.error.message,
      discordUserId: body.discordUserId,
    })
    return c.json({ ok: false, reason: result.error.message }) as Response
  }

  return c.json({ ok: true, messageId: result.value.messageId })
}
