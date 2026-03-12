import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'api',
  component: 'notify-login-complete',
})

export interface NotifyLoginCompleteOptions {
  botInternalUrl: string
  internalSecret: string
  discordUserId: string
}

/**
 * Notifica o discord-bot que um usuário completou o login OAuth.
 * Fire-and-forget: falha na notificação é non-fatal (logada mas não propaga).
 */
export async function notifyLoginComplete(
  opts: NotifyLoginCompleteOptions,
): Promise<void> {
  try {
    const url = `${opts.botInternalUrl}/internal/notify/login-complete`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': opts.internalSecret,
      },
      body: JSON.stringify({
        discordUserId: opts.discordUserId,
      }),
    })

    if (!response.ok) {
      logger.warn('Failed to notify bot of login complete', {
        status: response.status,
        discordUserId: opts.discordUserId,
      })
      return
    }

    logger.info('Login complete notification sent', {
      discordUserId: opts.discordUserId,
    })
  } catch (error) {
    logger.warn('Failed to notify bot of login complete — non-fatal', {
      error: error instanceof Error ? error.message : String(error),
      discordUserId: opts.discordUserId,
    })
  }
}
