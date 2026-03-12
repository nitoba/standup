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
import { runStandupJob } from './job/standup/standup-job.js'
import { runWeeklyDigestJob } from './job/weekly-digest-job.js'
import { notifyStandupReminder } from './notifications/notify-standup-reminder.js'

/** Cron expression for weekly digest: every Monday at 09:00 in user's timezone. */
const DIGEST_CRON = '0 9 * * 1'

/** Stale run threshold: jobs running longer than this are considered crashed (30 min). */
const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000

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

/**
 * Starts a single polling cron that runs every minute.
 * Each tick queries all active user_settings and checks per-user cron expressions.
 *
 * Changes to user_settings (cron, timezone, active) are picked up within 60 seconds.
 *
 * Key design decisions:
 * - `getDb` is called once and reused across ticks (avoids connection pool exhaustion).
 * - `{ protect: true }` prevents overlapping ticks if processing takes >1 minute.
 * - Each user is processed inside an isolated try/catch so one failure never skips others.
 */
export function startScheduler(
  env: WorkerEnv,
  mcpClient?: AzureMcpClient,
): {
  pollCron: Cron
  stop: () => void
} {
  // FIX 1: Create DB connection once, outside the tick, so it is reused across runs.
  const db = getDb(env.DATABASE_URL)
  const settingsRepo = new UserSettingsRepository(db)
  const userRepo = new UserRepository(db)
  const jobRunRepo = new JobRunRepository(db)

  // FIX 2: `protect: true` prevents a new tick from starting if the previous one
  // is still running (e.g. slow DB, many users). Without this, ticks pile up.
  const pollCron = new Cron('* * * * *', { protect: true }, async () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    // 1. Clear expired snoozes
    await settingsRepo.clearExpiredSnoozes()

    // 2. Get all active user settings
    const activeResult = await settingsRepo.findAllActive()
    if (activeResult.isErr()) {
      logger.error('Failed to fetch active user settings', {
        error: activeResult.error.message,
      })
      return
    }

    const activeSettings = activeResult.value

    for (const settings of activeSettings) {
      // FIX 3: Isolate each user so that an unexpected error never silently skips
      // the remaining users in the loop.
      try {
        await processUserSettings({
          settings,
          now,
          today,
          env,
          mcpClient,
          userRepo,
          jobRunRepo,
        })
      } catch (err) {
        logger.error('Unexpected error processing user — skipping', {
          userId: settings.userId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type UserSettings = {
  userId: string
  cancelledDate: string | null
  snoozedUntil: number | null
  reminderCron: string
  standupCron: string
  recoveryCron: string
  timezone: string
  selectedRepos: string
  gitAuthor: string
}

type ProcessArgs = {
  settings: UserSettings
  now: Date
  today: string
  env: WorkerEnv
  mcpClient?: AzureMcpClient
  userRepo: UserRepository
  jobRunRepo: JobRunRepository
}

async function processUserSettings({
  settings,
  now,
  today,
  env,
  mcpClient,
  userRepo,
  jobRunRepo,
}: ProcessArgs): Promise<void> {
  // Skip if cancelled for today
  if (settings.cancelledDate === today) return

  // Skip if snoozed
  if (settings.snoozedUntil && settings.snoozedUntil > now.getTime()) return

  // Resolve discordUserId
  const discordResult = await userRepo.findDiscordIdByUserId(settings.userId)
  if (discordResult.isErr() || !discordResult.value) return
  const discordUserId = discordResult.value

  // --- Reminder ---
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

  // --- Standup ---
  if (isCronDueNow(settings.standupCron, settings.timezone, now)) {
    logger.info('Standup cron triggered', { userId: settings.userId })

    const selectedRepos = parseSelectedRepos(settings.selectedRepos)
    if (selectedRepos.length === 0) {
      logger.warn('No repos selected for scheduled standup', {
        userId: settings.userId,
      })
    } else {
      runStandupJob(
        env,
        {
          userId: settings.userId,
          discordUserId,
          reposRootPath: env.REPOS_ROOT_PATH,
          selectedRepos,
          gitAuthor: settings.gitAuthor,
          timezone: settings.timezone,
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
  }

  // --- Recovery ---
  if (isCronDueNow(settings.recoveryCron, settings.timezone, now)) {
    logger.info('Recovery cron triggered', {
      userId: settings.userId,
      date: today,
    })

    // Clean stale runs
    const staleResult = await jobRunRepo.findStaleRuns(STALE_RUN_MAX_AGE_MS)
    if (staleResult.isOk() && staleResult.value.length > 0) {
      for (const stale of staleResult.value) {
        logger.warn('Stale run detected — marking as failed', {
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

    // No-op if already succeeded today
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
      return
    }

    const recoveryRepos = parseSelectedRepos(settings.selectedRepos)
    if (recoveryRepos.length === 0) {
      logger.warn('No repos selected for recovery run', {
        userId: settings.userId,
      })
      return
    }

    logger.info('Recovery cron: no successful run found — executing job', {
      userId: settings.userId,
      date: today,
    })

    runStandupJob(
      env,
      {
        userId: settings.userId,
        discordUserId,
        reposRootPath: env.REPOS_ROOT_PATH,
        selectedRepos: recoveryRepos,
        gitAuthor: settings.gitAuthor,
        timezone: settings.timezone,
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

  // --- Weekly Digest ---
  if (isCronDueNow(DIGEST_CRON, settings.timezone, now)) {
    logger.info('Weekly digest cron triggered', { userId: settings.userId })

    runWeeklyDigestJob(env, { userId: settings.userId }).catch(
      (error: unknown) => {
        logger.error('Weekly digest job threw unexpectedly', {
          userId: settings.userId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      },
    )
  }
}
