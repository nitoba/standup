import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'worker',
  component: 'notify-standup-reminder',
})

export interface NotifyStandupReminderOptions {
  botInternalUrl: string
  secret: string
  nextRunAt: string // ISO timestamp of when the standup job will fire
}

/**
 * Notifica o discord-bot que o standup será gerado em breve.
 * O bot enviará uma DM ao usuário com botões para gerenciar o agendamento.
 * O worker não sabe nada sobre Discord — apenas dispara um POST HTTP genérico.
 * Non-fatal: falha é logada pelo chamador, não propaga.
 */
export async function notifyStandupReminder(
  opts: NotifyStandupReminderOptions,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const url = `${opts.botInternalUrl}/internal/notify/standup-reminder`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': opts.secret,
        },
        body: JSON.stringify({ nextRunAt: opts.nextRunAt }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      logger.info('Standup reminder notification sent', {
        nextRunAt: opts.nextRunAt,
        url,
      })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord-bot',
        message: `Failed to notify bot of reminder: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
