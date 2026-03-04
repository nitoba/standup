import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Cron } from 'croner'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

function executeStandupJob() {
  const jobLogger = withContext(logger, { job: 'standup' })
  jobLogger.info('Standup job tick (phase 1 stub)')
}

function scheduleReminderJob() {
  const jobLogger = withContext(logger, { job: 'reminder' })
  jobLogger.info('Reminder job tick (phase 1 stub)')
}

function bootstrapWorker() {
  const envResult = loadEnv()
  if (Result.isError(envResult)) {
    throw new Error(`Invalid environment: ${envResult.error.message}`)
  }

  const env = envResult.value

  const standupCron = new Cron(
    env.STANDUP_CRON,
    { timezone: env.TIMEZONE },
    executeStandupJob,
  )
  const reminderCron = new Cron(
    env.STANDUP_REMINDER_CRON,
    { timezone: env.TIMEZONE },
    scheduleReminderJob,
  )

  logger.info('Scheduler active', {
    standupCron: standupCron.nextRun()?.toISOString() ?? 'n/a',
    reminderCron: reminderCron.nextRun()?.toISOString() ?? 'n/a',
  })
}

if (import.meta.main) {
  bootstrapWorker()
}
