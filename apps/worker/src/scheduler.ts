import type { WorkerEnv } from '@standup/config'
import { getDb, JobRunRepository, UserRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import { Cron } from 'croner'
import { runStandupJob } from './job/standup-job.js'
import { notifyStandupReminder } from './notifications/notify-standup-reminder.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

// Limite de tempo para considerar um job como "travado" (30 min)
const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Estado in-memory do lembrete de standup.
 * Permite ao usuário adiar ou cancelar o standup via botões no Discord.
 * Reseta naturalmente quando o processo reinicia ou a data muda.
 */
export interface ReminderState {
  /** Se definido e no futuro, o standupCron pulará a execução desta vez. */
  snoozedUntil: Date | null
  /** Se igual à data de hoje ('YYYY-MM-DD'), o standupCron fará no-op. */
  cancelledDate: string | null
}

/**
 * Starts the cron scheduler for standup generation, reminders and recovery.
 *
 * Padrão 5 (Akita): Safety Nets com Cron — o recovery cron verifica se o job
 * principal rodou com sucesso e re-executa caso não tenha. O job é idempotente:
 * se já rodou com sucesso hoje, retorna no-op via LockAlreadyHeldError/JobAlreadyCompletedError.
 *
 * Returns the three Cron instances and the mutable reminderState so the HTTP
 * router can apply snooze/cancel actions from Discord button interactions.
 */
export function startScheduler(env: WorkerEnv): {
  standupCron: Cron
  reminderCron: Cron
  recoveryCron: Cron
  reminderState: ReminderState
} {
  const reminderState: ReminderState = {
    snoozedUntil: null,
    cancelledDate: null,
  }

  const standupCron = new Cron(
    env.STANDUP_CRON,
    { timezone: env.TIMEZONE },
    () => {
      const today = new Date().toISOString().slice(0, 10)

      // Check cancel-today flag
      if (reminderState.cancelledDate === today) {
        logger.info(
          'Standup cancelled for today via reminder button — skipping',
          {
            date: today,
          },
        )
        return
      }

      // Check snooze flag
      if (
        reminderState.snoozedUntil &&
        reminderState.snoozedUntil > new Date()
      ) {
        logger.info(
          'Standup snoozed via reminder button — skipping this fire',
          {
            snoozedUntil: reminderState.snoozedUntil.toISOString(),
          },
        )
        return
      }

      // Clear snooze once it fires (or if it already expired)
      reminderState.snoozedUntil = null

      // Resolve userId from DISCORD_USER_ID env (Phase 2b will iterate all users)
      const db = getDb(env.DATABASE_URL)
      const userRepo = new UserRepository(db)
      const userIdResult = userRepo.findUserIdByDiscordId(env.DISCORD_USER_ID)
      if (userIdResult.isErr() || !userIdResult.value) {
        logger.warn(
          'Cannot resolve userId for DISCORD_USER_ID — skipping cron standup',
          { discordUserId: env.DISCORD_USER_ID },
        )
        return
      }

      runStandupJob(env, {
        userId: userIdResult.value,
        discordUserId: env.DISCORD_USER_ID,
      }).catch((error: unknown) => {
        logger.error('Standup job threw unexpectedly', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      })
    },
  )

  const reminderCron = new Cron(
    env.STANDUP_REMINDER_CRON,
    { timezone: env.TIMEZONE },
    () => {
      const nextRunAt =
        standupCron.nextRun()?.toISOString() ?? new Date().toISOString()

      logger.info('Standup reminder triggered — notifying bot', { nextRunAt })

      notifyStandupReminder({
        botInternalUrl: env.BOT_INTERNAL_URL,
        secret: env.INTERNAL_SECRET,
        nextRunAt,
      })
        .then((result) => {
          if (result.isErr()) {
            logger.warn('Failed to notify bot of standup reminder', {
              error: result.error.message,
            })
          }
        })
        .catch((err: unknown) => {
          logger.error('Unexpected error notifying bot of reminder', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
    },
  )

  /**
   * Recovery cron — Padrão 5 do Akita.
   *
   * Roda após o cron principal (ex: 18:00 quando o principal é 17:30).
   * Verifica se existe um job 'success' para hoje; caso contrário, re-executa.
   * Se já existe sucesso ou lock ativo, runStandupJob faz no-op (idempotente).
   *
   * Também verifica stale runs (travados por crash) e os marca como 'failed'
   * para permitir nova tentativa.
   */
  const recoveryCron = new Cron(
    env.STANDUP_RECOVERY_CRON,
    { timezone: env.TIMEZONE },
    async () => {
      const today = new Date().toISOString().slice(0, 10)
      logger.info('Recovery cron triggered — checking job status', {
        date: today,
      })

      // 1. Limpar stale runs (travados por crash do processo)
      const db = getDb(env.DATABASE_URL)
      const jobRunRepo = new JobRunRepository(db)

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

      // 2. Verificar se já existe sucesso para hoje
      const runResult = await jobRunRepo.findByJobAndDate('standup', today)
      if (runResult.isOk() && runResult.value?.status === 'success') {
        logger.info('Recovery cron: job already succeeded today — no-op', {
          date: today,
        })
        return
      }

      // 3. Resolve userId from DISCORD_USER_ID env (Phase 2b will iterate all users)
      const userRepo = new UserRepository(db)
      const userIdResult = userRepo.findUserIdByDiscordId(env.DISCORD_USER_ID)
      if (userIdResult.isErr() || !userIdResult.value) {
        logger.warn(
          'Recovery cron: cannot resolve userId for DISCORD_USER_ID — skipping',
          { discordUserId: env.DISCORD_USER_ID },
        )
        return
      }

      // 4. Re-executar o job (idempotente: lock + JobAlreadyCompletedError protegem)
      logger.info('Recovery cron: no successful run found — executing job', {
        date: today,
      })
      runStandupJob(env, {
        userId: userIdResult.value,
        discordUserId: env.DISCORD_USER_ID,
      }).catch((error: unknown) => {
        logger.error('Recovery job threw unexpectedly', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      })
    },
  )

  logger.info('Scheduler active', {
    standupCron: standupCron.nextRun()?.toISOString() ?? 'n/a',
    reminderCron: reminderCron.nextRun()?.toISOString() ?? 'n/a',
    recoveryCron: recoveryCron.nextRun()?.toISOString() ?? 'n/a',
  })

  return { standupCron, reminderCron, recoveryCron, reminderState }
}
