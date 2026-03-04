import type { AppEnv } from '@standup/config'
import { createServiceLogger } from '@standup/logger'
import { Cron } from 'croner'
import { runStandupJob } from './standup-job.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

/**
 * Starts the cron scheduler for standup generation and reminders.
 * Returns the two Cron instances so callers can inspect nextRun or stop them.
 */
export function startScheduler(env: AppEnv): {
  standupCron: Cron
  reminderCron: Cron
} {
  const standupCron = new Cron(
    env.STANDUP_CRON,
    { timezone: env.TIMEZONE },
    () => {
      runStandupJob(env).catch((error: unknown) => {
        logger.error('Standup job threw unexpectedly', { error })
      })
    },
  )

  const reminderCron = new Cron(
    env.STANDUP_REMINDER_CRON,
    { timezone: env.TIMEZONE },
    () => {
      logger.info('Standup reminder — job will run soon', {
        nextRun: standupCron.nextRun()?.toISOString() ?? 'n/a',
      })
    },
  )

  logger.info('Scheduler active', {
    standupCron: standupCron.nextRun()?.toISOString() ?? 'n/a',
    reminderCron: reminderCron.nextRun()?.toISOString() ?? 'n/a',
  })

  return { standupCron, reminderCron }
}
