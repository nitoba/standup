import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { snoozeReminder } from '../../../services/worker-client.js'
import { getUserId } from '../../utils/get-user-id.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminder-snooze',
})

export interface SnoozeReminderDeps {
  workerInternalUrl: string
  internalSecret: string
}

/**
 * POST /reminders/snooze
 */

export function registerSnoozeReminderRoute(
  app: Hono<any>,
  opts: SnoozeReminderDeps,
): void {
  app.post('/reminders/snooze', async (c) => {
    const userId = getUserId(c)

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await snoozeReminder(
      {
        workerInternalUrl: opts.workerInternalUrl,
        internalSecret: opts.internalSecret,
      },
      { userId },
    )

    if (result.isErr()) {
      logger.error('Failed to snooze reminder on worker', {
        error: result.error.message,
        userId,
      })
      return c.json({ error: 'Worker unavailable' }, 503)
    }

    return c.json({ data: result.value })
  })
}
