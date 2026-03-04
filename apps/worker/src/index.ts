import type { AppEnv } from '@standup/config'
import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { Cron } from 'croner'
import { runStandupJob } from './standup-job.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

async function executeStandupJob(env: AppEnv): Promise<void> {
  await runStandupJob(env)
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
    () => {
      executeStandupJob(env).catch((error: unknown) => {
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
}

if (import.meta.main) {
  bootstrapWorker()
}
