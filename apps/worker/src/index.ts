import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { Cron } from 'croner'

function executeStandupJob() {
  console.log('[worker] standup job tick (phase 1 stub)')
}

function scheduleReminderJob() {
  console.log('[worker] reminder tick (phase 1 stub)')
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

  console.log('[worker] scheduler active', {
    standupCron: standupCron.nextRun()?.toISOString() ?? 'n/a',
    reminderCron: reminderCron.nextRun()?.toISOString() ?? 'n/a',
  })
}

if (import.meta.main) {
  bootstrapWorker()
}
