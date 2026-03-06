import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import type { ReminderState } from '../../scheduler.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-snooze',
})

const SNOOZE_MINUTES = 15

/**
 * POST /internal/reminder/snooze
 *
 * Sets snoozedUntil to now + 15 minutes so the next standupCron fire is skipped.
 * Always returns 200 — failure to snooze is non-fatal (standup will still run).
 */
export function handleSnoozeReminder(
  c: Context,
  reminderState: ReminderState,
): Response {
  const snoozedUntil = new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000)
  reminderState.snoozedUntil = snoozedUntil

  logger.info('Standup snoozed via Discord button', {
    snoozedUntil: snoozedUntil.toISOString(),
    minutes: SNOOZE_MINUTES,
  })

  return c.json({ ok: true, snoozedUntil: snoozedUntil.toISOString() })
}
