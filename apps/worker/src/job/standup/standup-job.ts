import type { AzureMcpClient } from '@standup/azure-devops'
import type { WorkerEnv } from '@standup/config'
import { getDb, JobRunRepository, StandupRepository } from '@standup/db'
import { JobAlreadyCompletedError, LockAlreadyHeldError } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { notifyJobFailed } from '../../notifications/notify-job-failed.js'
import { notifyStandupEvent } from '../../notifications/notify-standup-event.js'
import { notifyUserDm } from '../../notifications/notify-user-dm.js'
import { executePipeline } from './standup-pipeline.js'
import type { StandupJobOptions, StandupRunMode } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DM_COLORS = {
  INFO: 0x3498db,
  WARNING: 0xf39c12,
  ERROR: 0xe74c3c,
} as const

const logger = createServiceLogger({
  service: 'worker',
  component: 'standup-job',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalDateString(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)
}

export function resolveRunMode(options: StandupJobOptions): StandupRunMode {
  if (options.rewriteInstruction?.trim()) return 'adjust'
  if (options.reuseExistingSource) return 'regenerate'
  return 'generate'
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Runs the standup job for a single user.
 *
 * This function is intentionally thin — it only handles:
 *  - Distributed lock acquisition and release
 *  - User-facing DM notifications for lock/completion states
 *  - Dispatching to executePipeline
 *  - Finalizing with success/failure events and lock release
 *
 * All standup generation logic lives in standup-pipeline.ts and the strategies.
 */
export async function runStandupJob(
  env: WorkerEnv,
  options: StandupJobOptions,
  mcpClient?: AzureMcpClient,
): Promise<void> {
  const runId = Bun.randomUUIDv7()
  const today = toLocalDateString(new Date(), options.timezone)
  const runMode = resolveRunMode(options)

  const jobLogger = withContext(logger, {
    job: 'standup',
    run: runId,
    date: today,
  })
  jobLogger.info('Standup job started')

  const db = getDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)
  const jobRunRepo = new JobRunRepository(db)
  const standupRepo = new StandupRepository(db)

  // ---------------------------------------------------------------------------
  // 1. Acquire distributed lock — prevents concurrent runs and enforces idempotency
  // ---------------------------------------------------------------------------

  const lockResult = await jobRunRepo.acquireLock({
    id: runId,
    jobName: 'standup',
    date: today,
    userId: options.userId,
    forceRegenerate: options.forceRegenerate,
  })

  if (lockResult.isErr()) {
    await handleLockError(lockResult.error, env, options, jobLogger)
    return
  }

  // ---------------------------------------------------------------------------
  // 2. Notify user that generation has started (best-effort, non-fatal)
  // ---------------------------------------------------------------------------

  if (options.discordUserId.trim()) {
    await notifyUserDm({
      botInternalUrl: env.BOT_INTERNAL_URL,
      secret: env.INTERNAL_SECRET,
      discordUserId: options.discordUserId,
      title: '⏳ Gerando seu standup',
      message:
        'Seu standup está sendo gerado em background. Você receberá uma DM assim que estiver pronto para revisão.',
      color: DM_COLORS.INFO,
    }).catch((err: unknown) => {
      jobLogger.warn('Failed to send start DM to user — non-fatal', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  // ---------------------------------------------------------------------------
  // 3. Execute the pipeline (collect → generate → persist → notify)
  // ---------------------------------------------------------------------------

  const result = await executePipeline({
    env,
    options,
    runId,
    today,
    runMode,
    standupRepo,
    mcpClient,
    jobLogger,
  })

  // ---------------------------------------------------------------------------
  // 4. Release lock and emit outcome events
  // ---------------------------------------------------------------------------

  if (result.isErr()) {
    jobLogger.error('Standup job failed', { error: result.error.message })

    await jobRunRepo.releaseLock(runId, 'failed', result.error.message)

    await notifyStandupEvent({
      apiInternalUrl: env.API_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
      event: {
        type: 'standup_failed',
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        message: result.error.message,
      },
    })

    const failNotify = await notifyJobFailed({
      botInternalUrl: env.BOT_INTERNAL_URL,
      secret: env.INTERNAL_SECRET,
      error: result.error.message,
      context: 'standup-job',
      discordUserId: options.discordUserId,
    })

    if (failNotify.isErr()) {
      jobLogger.warn(
        'Failed to notify bot about job failure — check logs manually',
        {
          error: failNotify.error.message,
        },
      )
    }

    return
  }

  await jobRunRepo.releaseLock(runId, 'success')

  const standupId = result.value
  if (standupId !== null) {
    jobLogger.info('Standup job completed', { standupId })
  } else {
    jobLogger.info('Standup job completed — no standup generated (no commits)')
  }
}

// ---------------------------------------------------------------------------
// Lock error handler
// ---------------------------------------------------------------------------

async function handleLockError(
  error: Error,
  env: WorkerEnv,
  options: StandupJobOptions,
  jobLogger: ReturnType<typeof withContext>,
): Promise<void> {
  if (LockAlreadyHeldError.is(error)) {
    jobLogger.warn(
      'Job already running — skipping (lock held by another instance)',
    )
    if (options.discordUserId.trim()) {
      await notifyUserDm({
        botInternalUrl: env.BOT_INTERNAL_URL,
        secret: env.INTERNAL_SECRET,
        discordUserId: options.discordUserId,
        title: '⏳ Standup já em processamento',
        message:
          'Seu standup já está sendo gerado em background. Você receberá uma DM assim que estiver pronto.',
        color: DM_COLORS.WARNING,
      }).catch(() => {
        /* non-fatal */
      })
    }
    return
  }

  if (JobAlreadyCompletedError.is(error)) {
    jobLogger.info('Job already completed for today — no-op (idempotent)')
    if (options.discordUserId.trim()) {
      await notifyUserDm({
        botInternalUrl: env.BOT_INTERNAL_URL,
        secret: env.INTERNAL_SECRET,
        discordUserId: options.discordUserId,
        title: '✅ Standup já gerado hoje',
        message:
          'O standup de hoje já foi gerado. Use `/standup list` para ver o status ou aprová-lo.',
        color: DM_COLORS.INFO,
      }).catch(() => {
        /* non-fatal */
      })
    }
    return
  }

  // DbError — infra issue, no user DM (nothing actionable for the user)
  jobLogger.error('Failed to acquire job lock', { error: error.message })
}
