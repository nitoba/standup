import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'worker',
  component: 'notify-job-failed',
})

export interface NotifyJobFailedOptions {
  botInternalUrl: string
  secret: string
  error: string
  context?: string
  /** Quando presente, o bot também enviará uma DM direta ao usuário além da notificação no canal. */
  discordUserId?: string
}

/**
 * Notifica o discord-bot que o standup job falhou (Padrão 8 do Akita).
 * O bot publicará um embed vermelho no canal Discord para visibilidade imediata.
 * Non-fatal: falha aqui é logada mas não propaga — o worker já registrou o erro.
 */
export async function notifyJobFailed(
  opts: NotifyJobFailedOptions,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const url = `${opts.botInternalUrl}/internal/notify/job-failed`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': opts.secret,
        },
        body: JSON.stringify({
          error: opts.error,
          context: opts.context,
          discordUserId: opts.discordUserId,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      logger.info('Job failed notification sent', {
        error: opts.error,
        context: opts.context,
        discordUserId: opts.discordUserId,
        url,
      })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord-bot',
        message: `Failed to notify job failure: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
