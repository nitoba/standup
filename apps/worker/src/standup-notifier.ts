import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'worker',
  component: 'standup-notifier',
})

export interface NotifyOptions {
  botInternalUrl: string
  standupId: string
  secret: string
}

/**
 * Notifica o discord-bot que um standup está pronto para revisão.
 * O worker não sabe nada sobre Discord — apenas dispara um POST HTTP genérico.
 * Quem decide como apresentar ao usuário é o discord-bot.
 */
export async function notifyStandupReady(
  opts: NotifyOptions,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const url = `${opts.botInternalUrl}/internal/notify/standup-ready`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': opts.secret,
        },
        body: JSON.stringify({ standupId: opts.standupId }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      logger.info('Standup ready notification sent', {
        standupId: opts.standupId,
        url,
      })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord-bot',
        message: `Failed to notify bot: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
