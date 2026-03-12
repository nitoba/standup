import { sValidator } from '@hono/standard-validator'
import { getDb, UserSettingsRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import z from 'zod'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-cancel',
})

const bodySchema = z.object({
  userId: z.string().min(1),
})

/**
 * POST /internal/reminder/cancel
 *
 * Sets cancelledDate to today so the next standupCron fire is a no-op.
 * Resets automatically the next day (date changes).
 * Requires { userId } in the JSON body.
 * Always returns 200 — failure to cancel is non-fatal.
 */
export function registerReminderCancelRoute(
  app: Hono,
  opts: { databaseUrl: string },
): void {
  app.post(
    '/internal/reminder/cancel',
    sValidator('json', bodySchema),
    async (c) => {
      const { userId } = c.req.valid('json')

      const db = getDb(opts.databaseUrl)
      const repo = new UserSettingsRepository(db)

      // Compute today in the user's timezone so the cancellation guard matches
      // the same date used by the scheduler and standup job.
      const settingsResult = await repo.findByUserId(userId)
      const timezone =
        settingsResult.isOk() && settingsResult.value?.timezone
          ? settingsResult.value.timezone
          : DEFAULT_TIMEZONE
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
      }).format(new Date())

      const result = await repo.updateCancelledDate(userId, today)

      if (result.isErr()) {
        logger.error('Failed to persist cancel', {
          userId,
          error: result.error.message,
        })
        return c.json({ error: 'Failed to cancel' }, 500)
      }

      logger.info('Standup cancelled for today via Discord button', {
        userId,
        date: today,
      })

      return c.json({ ok: true, cancelledDate: today })
    },
  )
}
