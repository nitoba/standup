import type { AppEnv } from '@standup/config'
import { getDb, JobRunRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import { Cron } from 'croner'
import { runStandupJob } from './job/standup-job.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'scheduler',
})

// Limite de tempo para considerar um job como "travado" (30 min)
const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000

/**
 * Starts the cron scheduler for standup generation, reminders and recovery.
 *
 * Padrão 5 (Akita): Safety Nets com Cron — o recovery cron verifica se o job
 * principal rodou com sucesso e re-executa caso não tenha. O job é idempotente:
 * se já rodou com sucesso hoje, retorna no-op via LockAlreadyHeldError/JobAlreadyCompletedError.
 *
 * Returns the three Cron instances so callers can inspect nextRun or stop them.
 */
export function startScheduler(env: AppEnv): {
  standupCron: Cron
  reminderCron: Cron
  recoveryCron: Cron
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

      // 3. Re-executar o job (idempotente: lock + JobAlreadyCompletedError protegem)
      logger.info('Recovery cron: no successful run found — executing job', {
        date: today,
      })
      runStandupJob(env).catch((error: unknown) => {
        logger.error('Recovery job threw unexpectedly', { error })
      })
    },
  )

  logger.info('Scheduler active', {
    standupCron: standupCron.nextRun()?.toISOString() ?? 'n/a',
    reminderCron: reminderCron.nextRun()?.toISOString() ?? 'n/a',
    recoveryCron: recoveryCron.nextRun()?.toISOString() ?? 'n/a',
  })

  return { standupCron, reminderCron, recoveryCron }
}
