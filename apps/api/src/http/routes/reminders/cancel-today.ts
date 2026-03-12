import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { cancelReminderForToday } from '../../../services/worker-client.js'
import { getUserId } from '../../utils/get-user-id.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminders-cancel-today',
})

export interface CancelTodayDeps {
  workerInternalUrl: string
  internalSecret: string
}

/**
 * POST /reminders/cancel-today
 */

export function registerCancelTodayReminderRoute(
  app: Hono<any>,
  opts: CancelTodayDeps,
): void {
  app.post('/reminders/cancel-today', async (c) => {
    const userId = getUserId(c)

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await cancelReminderForToday(
      {
        workerInternalUrl: opts.workerInternalUrl,
        internalSecret: opts.internalSecret,
      },
      { userId },
    )

    if (result.isErr()) {
      logger.error('Failed to cancel reminder for today', {
        userId,
        error: result.error.message,
      })
      return c.json({ error: 'Worker unavailable' }, 503)
    }

    return c.json({ data: result.value })
  })
}
