import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { EMBED_COLORS } from '../../discord/embeds.js'
import { sendUserDm } from '../../discord/notifications/send-user-dm.js'
import { notifyJobFailed } from '../../services/job-notification-service.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-job-failed',
})

export const jobFailedBodySchema = z.object({
  error: z.string().min(1),
  context: z.string().optional(),
  discordUserId: z.string().optional(),
})

export type JobFailedBody = z.infer<typeof jobFailedBodySchema>

export interface JobFailedHandlerDeps {
  client: Client
  discordChannelId: string
}

/**
 * Handler para POST /internal/notify/job-failed.
 * Padrão 8 do Akita — Notificações de Status em Produção.
 * Publica embed vermelho no canal e, se discordUserId presente, também envia DM ao usuário.
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
    discordUserId: body.discordUserId,
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

  // Se discordUserId presente, também DM o usuário diretamente (non-fatal)
  if (body.discordUserId) {
    const dmResult = await sendUserDm({
      client: deps.client,
      discordUserId: body.discordUserId,
      title: '❌ Falha ao gerar standup',
      message: `Ocorreu um erro ao gerar o standup:\n\n${body.error}\n\nVerifique os logs ou tente novamente com \`/standup trigger\`.`,
      color: EMBED_COLORS.REJECTED,
    })
    if (dmResult.isErr()) {
      logger.warn('Failed to send job-failed DM to user', {
        discordUserId: body.discordUserId,
        error: dmResult.error.message,
      })
    }
  }

  const { notified, reason } = result.value
  if (!notified) {
    return c.json({ ok: false, reason }) as Response
  }

  return c.json({ ok: true })
}
