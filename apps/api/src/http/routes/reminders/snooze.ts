import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { snoozeReminder } from '../../../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminder-snooze',
})

export interface SnoozeReminderDeps {
  workerInternalUrl: string
  internalSecret: string
}

function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return typeof user?.id === 'string' ? user.id : undefined
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
