import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { snoozeReminder } from '../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminder-snooze',
})

export interface SnoozeReminderHandlerDeps {
  workerInternalUrl: string
  internalSecret: string
}

export async function handleSnoozeReminder(
  c: Context,
  deps: SnoozeReminderHandlerDeps,
): Promise<Response> {
  const user = c.get('user') as Record<string, unknown> | undefined
  const userId = typeof user?.id === 'string' ? user.id : undefined

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const result = await snoozeReminder(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
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
}
