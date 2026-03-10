import { createServiceLogger } from '@standup/logger'
import { tracedFetch } from '@standup/observability'

const logger = createServiceLogger({
  service: 'worker',
  component: 'notify-standup-event',
})

type StandupEventPayload =
  | {
      type: 'standup_progress'
      userId: string
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      step:
        | 'queued'
        | 'collecting_git'
        | 'enriching_data'
        | 'generating_standup'
        | 'saving_draft'
        | 'notifying_review'
        | 'completed'
        | 'no_activity'
      message: string
      standupId?: string
    }
  | {
      type: 'standup_generated'
      userId: string
      runId: string
      standupId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
    }
  | {
      type: 'standup_failed'
      userId: string
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      message: string
    }

export interface NotifyStandupEventOptions {
  apiInternalUrl: string
  internalSecret: string
  event: StandupEventPayload
}

export async function notifyStandupEvent(
  opts: NotifyStandupEventOptions,
): Promise<void> {
  try {
    const url = `${opts.apiInternalUrl}/internal/events/standup`

    const response = await tracedFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': opts.internalSecret,
      },
      body: JSON.stringify(opts.event),
    })

    if (!response.ok) {
      logger.warn('Failed to notify API of standup event', {
        status: response.status,
        eventType: opts.event.type,
        userId: opts.event.userId,
        runId: opts.event.runId,
      })
      return
    }

    logger.info('Standup event notification sent to API', {
      eventType: opts.event.type,
      userId: opts.event.userId,
      runId: opts.event.runId,
      date: opts.event.date,
    })
  } catch (error) {
    logger.warn(
      'Failed to notify API of standup event - non-fatal (SSE skipped)',
      {
        error: error instanceof Error ? error.message : String(error),
        eventType: opts.event.type,
        userId: opts.event.userId,
        runId: opts.event.runId,
      },
    )
  }
}
