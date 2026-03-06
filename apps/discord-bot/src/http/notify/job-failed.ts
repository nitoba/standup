import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { notifyJobFailed } from '../../services/job-notification-service.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-job-failed',
})

export const jobFailedBodySchema = z.object({
  error: z.string().min(1),
  context: z.string().optional(),
})

export type JobFailedBody = z.infer<typeof jobFailedBodySchema>

export interface JobFailedHandlerDeps {
  client: Client
  discordChannelId: string
}

/**
 * Handler para POST /internal/notify/job-failed.
 * Padrão 8 do Akita — Notificações de Status em Produção.
 * Retorna 200 mesmo quando falha — o worker não deve re-tentar por falha do Discord.
 */
export async function handleJobFailed(
  c: Context,
  body: JobFailedBody,
  deps: JobFailedHandlerDeps,
): Promise<Response> {
  logger.warn('Received job failure notification', {
    error: body.error,
    context: body.context,
  })

  const result = await notifyJobFailed(body.error, body.context, {
    client: deps.client,
    discordChannelId: deps.discordChannelId,
  })

  if (result.isErr()) {
    // Não deve ocorrer (notifyJobFailed absorve erros internamente)
    // mas se chegar aqui, ainda retornamos 200
    return c.json({ ok: false, reason: 'unexpected error' }) as Response
  }

  const { notified, reason } = result.value
  if (!notified) {
    return c.json({ ok: false, reason }) as Response
  }

  return c.json({ ok: true })
}
