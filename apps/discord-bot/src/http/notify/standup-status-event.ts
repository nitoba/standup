import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'notify-standup-status-event',
})

export interface NotifyStandupStatusEventOpts {
  apiInternalUrl: string
  internalSecret: string
  userId: string
  standupId: string
  newStatus: string
}

/**
 * Fire-and-forget: notifies the API that a standup status changed via Discord
 * interaction (approve/reject). The API then pushes a `standup_status_changed`
 * SSE event to the connected web client so the dashboard refreshes.
 *
 * Non-fatal: failures are logged but never propagate to the caller.
 */
export async function notifyStandupStatusEvent(
  opts: NotifyStandupStatusEventOpts,
): Promise<void> {
  const { apiInternalUrl, internalSecret, userId, standupId, newStatus } = opts

  try {
    const response = await fetch(`${apiInternalUrl}/internal/events/standup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        type: 'standup_status_changed',
        userId,
        standupId,
        newStatus,
      }),
    })

    if (!response.ok) {
      logger.warn('API rejected standup_status_changed notification', {
        userId,
        standupId,
        newStatus,
        status: response.status,
      })
    } else {
      logger.debug('standup_status_changed SSE event pushed to API', {
        userId,
        standupId,
        newStatus,
      })
    }
  } catch (err) {
    logger.warn('Failed to notify API of standup status change (non-fatal)', {
      userId,
      standupId,
      newStatus,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
