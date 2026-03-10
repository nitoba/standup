import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { tracedFetch } from '@standup/observability'

const logger = createServiceLogger({
  service: 'worker',
  component: 'notify-user-dm',
})

export interface NotifyUserDmOptions {
  botInternalUrl: string
  secret: string
  discordUserId: string
  title: string
  message: string
  /** Cor do embed em decimal (hex). */
  color?: number
}

/**
 * Envia uma DM direta ao usuário via discord-bot.
 * Usado para notificações informativas: nenhuma atividade, job já em andamento, etc.
 * Non-fatal: falha aqui deve ser logada, nunca propagar.
 */
export async function notifyUserDm(
  opts: NotifyUserDmOptions,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const url = `${opts.botInternalUrl}/internal/notify/user-dm`

      const response = await tracedFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': opts.secret,
        },
        body: JSON.stringify({
          discordUserId: opts.discordUserId,
          title: opts.title,
          message: opts.message,
          color: opts.color,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      logger.info('User DM notification sent', {
        discordUserId: opts.discordUserId,
        title: opts.title,
        url,
      })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord-bot',
        message: `Failed to send user DM notification: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
