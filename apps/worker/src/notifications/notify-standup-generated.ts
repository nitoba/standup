import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'worker',
  component: 'notify-standup-generated',
})

export interface NotifyStandupGeneratedOptions {
  apiInternalUrl: string
  internalSecret: string
  userId: string
  standupId: string
  date: string
}

/**
 * Notifica o API que um standup foi gerado e está pronto.
 * O API vai fazer push via SSE para o web client do usuário.
 *
 * Fire-and-forget: falha na notificação é non-fatal — o standup já está
 * salvo no DB e pode ser acessado via polling normal.
 */
export async function notifyStandupGenerated(
  opts: NotifyStandupGeneratedOptions,
): Promise<void> {
  try {
    const url = `${opts.apiInternalUrl}/internal/events/standup-generated`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': opts.internalSecret,
      },
      body: JSON.stringify({
        userId: opts.userId,
        standupId: opts.standupId,
        date: opts.date,
      }),
    })

    if (!response.ok) {
      logger.warn('Failed to notify API of standup generated', {
        status: response.status,
        userId: opts.userId,
        standupId: opts.standupId,
      })
      return
    }

    logger.info('Standup generated notification sent to API', {
      userId: opts.userId,
      standupId: opts.standupId,
      date: opts.date,
    })
  } catch (error) {
    logger.warn(
      'Failed to notify API of standup generated — non-fatal (SSE skipped)',
      {
        error: error instanceof Error ? error.message : String(error),
        userId: opts.userId,
        standupId: opts.standupId,
      },
    )
  }
}
