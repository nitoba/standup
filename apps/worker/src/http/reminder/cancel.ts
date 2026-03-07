import { UserSettingsRepository, getDb } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-cancel',
})

export interface CancelHandlerDeps {
  databaseUrl: string
}

/**
 * POST /internal/reminder/cancel
 *
 * Sets cancelledDate to today so the next standupCron fire is a no-op.
 * Resets automatically the next day (date changes).
 * Requires { userId } in the JSON body.
 * Always returns 200 — failure to cancel is non-fatal.
 */
export async function handleCancelReminder(
  c: Context,
  deps: CancelHandlerDeps,
): Promise<Response> {
  let body: Record<string, unknown> = {}
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
  }

  const userId = typeof body.userId === 'string' ? body.userId : undefined
  if (!userId) {
    return c.json({ error: 'userId is required' }, 400)
  }

  const today = new Date().toISOString().slice(0, 10)
  const db = getDb(deps.databaseUrl)
  const repo = new UserSettingsRepository(db)
  const result = await repo.updateCancelledDate(userId, today)

  if (result.isErr()) {
    logger.error('Failed to persist cancel', { userId, error: result.error.message })
    return c.json({ error: 'Failed to cancel' }, 500)
  }

  logger.info('Standup cancelled for today via Discord button', { userId, date: today })

  return c.json({ ok: true, cancelledDate: today })
}
