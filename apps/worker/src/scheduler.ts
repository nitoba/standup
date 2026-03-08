import type { AzureMcpClient } from '@standup/azure-devops'
import { type WorkerEnv } from '@standup/config'
import {
  getDb,
  JobRunRepository,
  UserRepository,
  UserSettingsRepository,
} from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import { Cron } from 'croner'
import { isCronDueNow } from './cron-matcher.js'
import { runStandupJob } from './job/standup-job.js'
import { notifyStandupReminder } from './notifications/notify-standup-reminder.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

/** Parses the JSON-stringified selectedRepos field from user_settings. */
function parseSelectedRepos(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((r): r is string => typeof r === 'string')
    }
    return []
  } catch {
    return []
  }
}

// Limite de tempo para considerar um job como "travado" (30 min)
const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Starts a single polling cron that runs every minute.
 * Each tick queries all active user_settings and checks per-user cron expressions.
 *
 * This replaces the previous 3 separate Cron instances with a unified polling approach.
 * Changes to user_settings (cron, timezone, active) are picked up within 60 seconds.
 */
export function startScheduler(
  env: WorkerEnv,
  mcpClient?: AzureMcpClient,
): {
  pollCron: Cron
  stop: () => void
} {
  const pollCron = new Cron('* * * * *', async () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    const db = getDb(env.DATABASE_URL)
    const settingsRepo = new UserSettingsRepository(db)
    const userRepo = new UserRepository(db)
    const jobRunRepo = new JobRunRepository(db)

    // 1. Clear expired snoozes
    await settingsRepo.clearExpiredSnoozes()

    // 2. Get all active user settings
    const activeResult = settingsRepo.findAllActive()
    if (activeResult.isErr()) {
      logger.error('Failed to fetch active user settings', {
        error: activeResult.error.message,
      })
      return
    }

    const activeSettings = activeResult.value

    for (const settings of activeSettings) {
      // Skip if cancelled for today
      if (settings.cancelledDate === today) {
        continue
      }

      // Skip if snoozed
      if (settings.snoozedUntil && settings.snoozedUntil > now.getTime()) {
        continue
      }

      // Resolve discordUserId
      const discordResult = userRepo.findDiscordIdByUserId(settings.userId)
      if (discordResult.isErr() || !discordResult.value) {
        continue
      }
      const discordUserId = discordResult.value

      // Check reminder cron
      if (isCronDueNow(settings.reminderCron, settings.timezone, now)) {
        const nextRunAt = new Date(now.getTime() + 10 * 60_000).toISOString()

        logger.info('Standup reminder triggered', {
          userId: settings.userId,
          nextRunAt,
        })

        notifyStandupReminder({
          botInternalUrl: env.BOT_INTERNAL_URL,
          secret: env.INTERNAL_SECRET,
          nextRunAt,
          discordUserId,
        })
          .then((result) => {
            if (result.isErr()) {
              logger.warn('Failed to notify bot of standup reminder', {
                userId: settings.userId,
                error: result.error.message,
              })
            }
          })
          .catch((err: unknown) => {
            logger.error('Unexpected error notifying bot of reminder', {
              userId: settings.userId,
              error: err instanceof Error ? err.message : String(err),
            })
          })
      }

      // Check standup cron
      if (isCronDueNow(settings.standupCron, settings.timezone, now)) {
        logger.info('Standup cron triggered', { userId: settings.userId })

        const selectedRepos = parseSelectedRepos(settings.selectedRepos)
        if (selectedRepos.length === 0) {
          logger.warn('No repos selected for scheduled standup', {
            userId: settings.userId,
          })
          continue
        }

        runStandupJob(
          env,
          {
            userId: settings.userId,
            discordUserId,
            reposRootPath: env.REPOS_ROOT_PATH,
            selectedRepos,
            gitAuthor: settings.gitAuthor,
          },
          mcpClient,
        ).catch((error: unknown) => {
          logger.error('Standup job threw unexpectedly', {
            userId: settings.userId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        })
      }

      // Check recovery cron
      if (isCronDueNow(settings.recoveryCron, settings.timezone, now)) {
        logger.info('Recovery cron triggered', {
          userId: settings.userId,
          date: today,
        })

        // Clean stale runs
        const staleResult = await jobRunRepo.findStaleRuns(STALE_RUN_MAX_AGE_MS)
        if (staleResult.isOk() && staleResult.value.length > 0) {
          for (const stale of staleResult.value) {
            logger.warn('Stale run detected — marking as failed for recovery', {
              id: stale.id,
              jobName: stale.jobName,
              date: stale.date,
              startedAt: stale.startedAt,
            })
            await jobRunRepo.releaseLock(
              stale.id,
              'failed',
              'Stale: process likely crashed',
            )
          }
        }

        // Check if already succeeded today (scoped by userId)
        const runResult = await jobRunRepo.findByJobAndDate(
          'standup',
          today,
          settings.userId,
        )
        if (runResult.isOk() && runResult.value?.status === 'success') {
          logger.info('Recovery cron: job already succeeded today — no-op', {
            userId: settings.userId,
            date: today,
          })
          continue
        }

        // Re-run the job (idempotent: lock protects against duplicates)
        logger.info('Recovery cron: no successful run found — executing job', {
          userId: settings.userId,
          date: today,
        })

        const recoverySelectedRepos = parseSelectedRepos(settings.selectedRepos)
        if (recoverySelectedRepos.length === 0) {
          logger.warn('No repos selected for recovery run', {
            userId: settings.userId,
          })
          continue
        }

        runStandupJob(
          env,
          {
            userId: settings.userId,
            discordUserId,
            reposRootPath: env.REPOS_ROOT_PATH,
            selectedRepos: recoverySelectedRepos,
            gitAuthor: settings.gitAuthor,
          },
          mcpClient,
        ).catch((error: unknown) => {
          logger.error('Recovery job threw unexpectedly', {
            userId: settings.userId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        })
      }
    }
  })

  logger.info('Scheduler active — polling every minute')

  return {
    pollCron,
    stop: () => pollCron.stop(),
  }
}
