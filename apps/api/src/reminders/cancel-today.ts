import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { cancelReminderForToday } from '../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminders-cancel-today',
})

export interface CancelTodayHandlerDeps {
  workerInternalUrl: string
  internalSecret: string
}

export async function handleCancelTodayReminder(
  c: Context,
  deps: CancelTodayHandlerDeps,
): Promise<Response> {
  const user = c.get('user') as Record<string, unknown> | undefined
  const userId = typeof user?.id === 'string' ? user.id : undefined

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const result = await cancelReminderForToday(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
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
}
