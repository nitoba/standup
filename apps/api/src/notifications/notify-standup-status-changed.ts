import type { StandupStatus } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'api',
  component: 'notify-standup-status-changed',
})

export interface NotifyStandupStatusChangedOptions {
  botInternalUrl: string
  internalSecret: string
  standupId: string
  newStatus: StandupStatus
}

/**
 * Notifica o discord-bot que o status de um standup mudou via web.
 * O bot vai:
 *   - Editar a DM de revisão (remover botões + emoji de status)
 *   - Se newStatus === 'approved': publicar embed verde no canal + transicionar para published
 *
 * Fire-and-forget: falha na notificação é non-fatal (logada mas não propaga).
 */
export async function notifyStandupStatusChanged(
  opts: NotifyStandupStatusChangedOptions,
): Promise<void> {
  try {
    const url = `${opts.botInternalUrl}/internal/notify/standup-status-changed`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': opts.internalSecret,
      },
      body: JSON.stringify({
        standupId: opts.standupId,
        newStatus: opts.newStatus,
      }),
    })

    if (!response.ok) {
      logger.warn('Failed to notify bot of standup status change', {
        status: response.status,
        standupId: opts.standupId,
        newStatus: opts.newStatus,
      })
      return
    }

    logger.info('Standup status change notification sent to bot', {
      standupId: opts.standupId,
      newStatus: opts.newStatus,
    })
  } catch (error) {
    logger.warn('Failed to notify bot of standup status change — non-fatal', {
      error: error instanceof Error ? error.message : String(error),
      standupId: opts.standupId,
      newStatus: opts.newStatus,
    })
  }
}
