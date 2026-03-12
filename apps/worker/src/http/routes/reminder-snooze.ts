import { sValidator } from '@hono/standard-validator'
import { getDb, UserSettingsRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import z from 'zod'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-reminder-snooze',
})

const SNOOZE_MINUTES = 15

const bodySchema = z.object({
  userId: z.string().min(1),
})

/**
 * POST /internal/reminder/snooze
 *
 * Sets snoozedUntil to now + 15 minutes so the next standupCron fire is skipped.
 * Requires { userId } in the JSON body.
 * Always returns 200 — failure to snooze is non-fatal (standup will still run).
 */
export function registerReminderSnoozeRoute(
  app: Hono,
  opts: { databaseUrl: string },
): void {
  app.post(
    '/internal/reminder/snooze',
    sValidator('json', bodySchema),
    async (c) => {
      const { userId } = c.req.valid('json')

      const snoozedUntil = Date.now() + SNOOZE_MINUTES * 60 * 1000
      const db = getDb(opts.databaseUrl)
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
    },
  )
}
