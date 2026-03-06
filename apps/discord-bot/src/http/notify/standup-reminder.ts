import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import type { Context } from 'hono'
import * as z from 'zod'
import { sendReminderDm } from '../../discord/notifications/send-reminder-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-standup-reminder',
})

export const standupReminderBodySchema = z.object({
  nextRunAt: z.string().min(1),
})

export type StandupReminderBody = z.infer<typeof standupReminderBodySchema>

export interface StandupReminderHandlerDeps {
  client: Client
  discordUserId: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Handler para POST /internal/notify/standup-reminder.
 * Disparado pelo worker X minutos antes do cron do standup.
 * Envia DM ao usuário com embed âmbar e botões para gerenciar o agendamento.
 * Retorna 200 mesmo em falha — o worker não deve re-tentar por falha do Discord.
 */
export async function handleStandupReminder(
  c: Context,
  body: StandupReminderBody,
  deps: StandupReminderHandlerDeps,
): Promise<Response> {
  logger.info('Received standup reminder notification', {
    nextRunAt: body.nextRunAt,
  })

  const result = await sendReminderDm(body.nextRunAt, {
    client: deps.client,
    discordUserId: deps.discordUserId,
    workerInternalUrl: deps.workerInternalUrl,
    internalSecret: deps.internalSecret,
  })

  if (result.isErr()) {
    logger.warn('Failed to send reminder DM — non-fatal', {
      error: result.error.message,
      nextRunAt: body.nextRunAt,
    })
    return c.json({ ok: false, reason: result.error.message }) as Response
  }

  return c.json({ ok: true, messageId: result.value.messageId })
}
