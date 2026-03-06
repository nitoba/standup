import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import type { ReminderState } from '../../scheduler.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-cancel',
})

/**
 * POST /internal/reminder/cancel
 *
 * Sets cancelledDate to today so the next standupCron fire is a no-op.
 * Resets automatically the next day (date changes).
 * Always returns 200 — failure to cancel is non-fatal.
 */
export function handleCancelReminder(
  c: Context,
  reminderState: ReminderState,
): Response {
  const today = new Date().toISOString().slice(0, 10)
  reminderState.cancelledDate = today

  logger.info('Standup cancelled for today via Discord button', { date: today })

  return c.json({ ok: true, cancelledDate: today })
}
