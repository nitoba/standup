import {
  DbError,
  JobAlreadyCompletedError,
  LockAlreadyHeldError,
  Result,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '../connection.js'
import type { JobRunRow } from '../schema.js'
import { jobRuns } from '../schema.js'

const logger = createServiceLogger({
  service: 'db',
  component: 'job-run-repository',
})

// ---------------------------------------------------------------------------
// Input/output types
// ---------------------------------------------------------------------------

export interface AcquireLockInput {
  id: string
  jobName: string
  date: string
  userId?: string
  forceRegenerate?: boolean
}

export type JobRunStatus = 'running' | 'success' | 'failed'

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * JobRunRepository — lock distribuído e idempotência para o scheduler.
 *
 * Padrão 2 (Akita): Locks Distribuídos — garante que só uma instância do job
 * roda por vez para o mesmo (jobName, date).
 *
 * Padrão 3 (Akita): Operações Atômicas — se já existe 'success' para o dia,
 * retorna JobAlreadyCompletedError (no-op seguro).
 */
export class JobRunRepository {
  constructor(private readonly db: Db) {}

  /**
   * Tenta adquirir o lock para (jobName, date).
   *
   * Retorna:
   * - Ok(JobRunRow) se o lock foi adquirido (registro 'running' criado)
   * - Err(LockAlreadyHeldError) se já existe um 'running' para o dia
   * - Err(JobAlreadyCompletedError) se já existe 'success' para o dia
   * - Err(DbError) em falha de DB
   */
  async acquireLock(
    input: AcquireLockInput,
  ): Promise<
    Result<JobRunRow, LockAlreadyHeldError | JobAlreadyCompletedError | DbError>
  > {
    try {
      // Verifica se já existe run para (jobName, date[, userId])
      const lockConditions = [
        eq(jobRuns.jobName, input.jobName),
        eq(jobRuns.date, input.date),
      ]
      if (input.userId) {
        lockConditions.push(eq(jobRuns.userId, input.userId))
      }
      const existing = await this.db
        .select()
        .from(jobRuns)
        .where(and(...lockConditions))
        .get()

      if (existing) {
        if (existing.status === 'running') {
          if (input.forceRegenerate) {
            // forceRegenerate ignora lock preso — trata como failed e permite nova execução
            logger.warn('Force regenerate — overriding stuck running lock', {
              jobName: input.jobName,
              date: input.date,
              existingId: existing.id,
            })
            await this.db.delete(jobRuns).where(eq(jobRuns.id, existing.id))
          } else {
            logger.warn('Lock already held', {
              jobName: input.jobName,
              date: input.date,
              existingId: existing.id,
            })
            return Result.err(
              new LockAlreadyHeldError({
                jobName: input.jobName,
                date: input.date,
              }),
            )
          }
        } else if (existing.status === 'success') {
          if (input.forceRegenerate) {
            logger.info('Force regenerate — deleting previous success', {
              jobName: input.jobName,
              date: input.date,
              existingId: existing.id,
            })
            await this.db.delete(jobRuns).where(eq(jobRuns.id, existing.id))
          } else {
            logger.info('Job already completed for today — no-op', {
              jobName: input.jobName,
              date: input.date,
            })
            return Result.err(
              new JobAlreadyCompletedError({
                jobName: input.jobName,
                date: input.date,
              }),
            )
          }
        } else {
          // status === 'failed': permite re-tentar — deleta o registro anterior
          await this.db.delete(jobRuns).where(eq(jobRuns.id, existing.id))
        }
      }

      // Cria o registro de lock
      const now = Date.now()
      await this.db.insert(jobRuns).values({
        id: input.id,
        jobName: input.jobName,
        date: input.date,
        status: 'running',
        userId: input.userId ?? null,
        startedAt: now,
        finishedAt: null,
        error: null,
      })

      const created = await this.db
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.id, input.id))
        .get()

      if (!created) {
        return this.dbErr(
          'acquireLock',
          new Error('insert succeeded but row not found'),
        )
      }

      logger.info('Lock acquired', {
        jobName: input.jobName,
        date: input.date,
        id: input.id,
      })

      return Result.ok(created)
    } catch (error) {
      return this.dbErr('acquireLock', error)
    }
  }

  /**
   * Libera o lock, marcando o job como 'success' ou 'failed'.
   * Deve ser chamado no finally do job para garantir limpeza.
   */
  async releaseLock(
    id: string,
    status: 'success' | 'failed',
    error?: string,
  ): Promise<Result<void, DbError>> {
    try {
      await this.db
        .update(jobRuns)
        .set({
          status,
          finishedAt: Date.now(),
          error: error ?? null,
        })
        .where(eq(jobRuns.id, id))

      logger.info('Lock released', { id, status })
      return Result.ok(undefined)
    } catch (err) {
      return this.dbErr('releaseLock', err)
    }
  }

  /**
   * Busca runs 'running' mais antigos que maxAgeMs.
   * Usado pelo recovery cron para detectar jobs travados.
   */
  async findStaleRuns(maxAgeMs: number): Promise<Result<JobRunRow[], DbError>> {
    try {
      const cutoff = Date.now() - maxAgeMs
      const rows = await this.db
        .select()
        .from(jobRuns)
        .where(
          and(eq(jobRuns.status, 'running'), lt(jobRuns.startedAt, cutoff)),
        )
        .all()

      return Result.ok(rows)
    } catch (error) {
      return this.dbErr('findStaleRuns', error)
    }
  }

  /**
   * Busca o run mais recente para (jobName, date).
   * Usado pelo recovery cron para verificar se o job já rodou com sucesso.
   */
  async findByJobAndDate(
    jobName: string,
    date: string,
    userId?: string,
  ): Promise<Result<JobRunRow | null, DbError>> {
    try {
      const conditions = [eq(jobRuns.jobName, jobName), eq(jobRuns.date, date)]
      if (userId) {
        conditions.push(eq(jobRuns.userId, userId))
      }
      const row = await this.db
        .select()
        .from(jobRuns)
        .where(and(...conditions))
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      return this.dbErr('findByJobAndDate', error)
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private dbErr(operation: string, error: unknown): Result<never, DbError> {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('db operation failed', { operation, error: message })
    return Result.err(new DbError({ operation, message }))
  }
}
