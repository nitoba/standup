import { getDb, UserSettingsRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-snooze',
})

const SNOOZE_MINUTES = 15

export interface SnoozeHandlerDeps {
  databaseUrl: string
}

/**
 * POST /internal/reminder/snooze
 *
 * Sets snoozedUntil to now + 15 minutes so the next standupCron fire is skipped.
 * Requires { userId } in the JSON body.
 * Always returns 200 — failure to snooze is non-fatal (standup will still run).
 */
export async function handleSnoozeReminder(
  c: Context,
  deps: SnoozeHandlerDeps,
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

  const snoozedUntil = Date.now() + SNOOZE_MINUTES * 60 * 1000
  const db = getDb(deps.databaseUrl)
  const repo = new UserSettingsRepository(db)
  const result = await repo.updateSnoozedUntil(userId, snoozedUntil)

  if (result.isErr()) {
    logger.error('Failed to persist snooze', {
      userId,
      error: result.error.message,
    })
    return c.json({ error: 'Failed to snooze' }, 500)
  }

  logger.info('Standup snoozed via Discord button', {
    userId,
    snoozedUntil: new Date(snoozedUntil).toISOString(),
    minutes: SNOOZE_MINUTES,
  })

  return c.json({
    ok: true,
    snoozedUntil: new Date(snoozedUntil).toISOString(),
  })
}
