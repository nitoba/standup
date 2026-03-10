import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../connection.js'
import { createTestDb } from '../connection.js'
import { JobRunRepository } from './job-run.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupTables(db: Db): Promise<void> {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS job_runs (
      id          TEXT PRIMARY KEY,
      job_name    TEXT NOT NULL,
      date        TEXT NOT NULL,
      status      TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      error       TEXT,
      user_id     TEXT
    )
  `)
}

function makeInput(
  overrides?: Partial<{ id: string; jobName: string; date: string }>,
) {
  return {
    id: 'run-1',
    jobName: 'standup',
    date: '2026-03-04',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: Db
let repo: JobRunRepository

beforeEach(async () => {
  db = createTestDb()
  await setupTables(db)
  repo = new JobRunRepository(db)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobRunRepository', () => {
  describe('acquireLock', () => {
    it('creates a running record and returns Ok on first call', async () => {
      const result = await repo.acquireLock(makeInput())

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.id).toBe('run-1')
      expect(result.value.jobName).toBe('standup')
      expect(result.value.date).toBe('2026-03-04')
      expect(result.value.status).toBe('running')
      expect(result.value.startedAt).toBeGreaterThan(0)
      expect(result.value.finishedAt).toBeNull()
      expect(result.value.error).toBeNull()
    })

    it('returns LockAlreadyHeldError when a running record exists for the same day', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1' }))

      const result = await repo.acquireLock(makeInput({ id: 'run-2' }))

      expect(result.status).toBe('error')
      if (result.status !== 'error') return
      expect(result.error._tag).toBe('LockAlreadyHeldError')
    })

    it('returns JobAlreadyCompletedError when success record exists for the same day', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1' }))
      await repo.releaseLock('run-1', 'success')

      const result = await repo.acquireLock(makeInput({ id: 'run-2' }))

      expect(result.status).toBe('error')
      if (result.status !== 'error') return
      expect(result.error._tag).toBe('JobAlreadyCompletedError')
    })

    it('allows re-acquiring lock when previous run failed', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1' }))
      await repo.releaseLock('run-1', 'failed', 'something went wrong')

      // Should be able to acquire again after failure
      const result = await repo.acquireLock(makeInput({ id: 'run-2' }))

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value.id).toBe('run-2')
      expect(result.value.status).toBe('running')
    })

    it('different dates do not conflict with each other', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1', date: '2026-03-04' }))

      const result = await repo.acquireLock(
        makeInput({ id: 'run-2', date: '2026-03-05' }),
      )

      expect(result.status).toBe('ok')
    })

    it('allows re-acquiring lock with forceRegenerate when success record exists', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1' }))
      await repo.releaseLock('run-1', 'success')

      const result = await repo.acquireLock({
        ...makeInput({ id: 'run-2' }),
        forceRegenerate: true,
      })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value.id).toBe('run-2')
      expect(result.value.status).toBe('running')
    })

    it('overrides stuck running lock when forceRegenerate is true', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1' }))

      const result = await repo.acquireLock({
        ...makeInput({ id: 'run-2' }),
        forceRegenerate: true,
      })

      // forceRegenerate derruba o lock preso e adquire novo
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value.id).toBe('run-2')
      expect(result.value.status).toBe('running')
    })

    it('different job names do not conflict with each other', async () => {
      await repo.acquireLock(makeInput({ id: 'run-1', jobName: 'standup' }))

      const result = await repo.acquireLock(
        makeInput({ id: 'run-2', jobName: 'other-job' }),
      )

      expect(result.status).toBe('ok')
    })
  })

  describe('releaseLock', () => {
    it('updates status to success and sets finishedAt', async () => {
      await repo.acquireLock(makeInput())

      const releaseResult = await repo.releaseLock('run-1', 'success')
      expect(releaseResult.status).toBe('ok')

      const row = await repo.findByJobAndDate('standup', '2026-03-04')
      expect(row.status).toBe('ok')
      if (row.status !== 'ok') return
      expect(row.value?.status).toBe('success')
      expect(row.value?.finishedAt).toBeGreaterThan(0)
      expect(row.value?.error).toBeNull()
    })

    it('updates status to failed and stores error message', async () => {
      await repo.acquireLock(makeInput())

      await repo.releaseLock('run-1', 'failed', 'LLM timeout')

      const row = await repo.findByJobAndDate('standup', '2026-03-04')
      expect(row.status).toBe('ok')
      if (row.status !== 'ok') return
      expect(row.value?.status).toBe('failed')
      expect(row.value?.error).toBe('LLM timeout')
    })
  })

  describe('findStaleRuns', () => {
    it('returns running records older than maxAgeMs', async () => {
      // Insert a stale running record manually (started 2h ago)
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      await db.insert((await import('../schema.js')).jobRuns).values({
        id: 'stale-run',
        jobName: 'standup',
        date: '2026-03-04',
        status: 'running',
        startedAt: twoHoursAgo,
        finishedAt: null,
        error: null,
      })

      const result = await repo.findStaleRuns(60 * 60 * 1000) // 1h threshold

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.id).toBe('stale-run')
    })

    it('does not return recent running records', async () => {
      await repo.acquireLock(makeInput()) // just started = not stale

      const result = await repo.findStaleRuns(60 * 60 * 1000) // 1h threshold

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toHaveLength(0)
    })

    it('does not return completed (success/failed) records even if old', async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      await db.insert((await import('../schema.js')).jobRuns).values({
        id: 'old-success',
        jobName: 'standup',
        date: '2026-03-03',
        status: 'success',
        startedAt: twoHoursAgo,
        finishedAt: twoHoursAgo + 30000,
        error: null,
      })

      const result = await repo.findStaleRuns(60 * 60 * 1000)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toHaveLength(0)
    })
  })

  describe('findByJobAndDate', () => {
    it('returns the run record for the given jobName and date', async () => {
      await repo.acquireLock(makeInput())

      const result = await repo.findByJobAndDate('standup', '2026-03-04')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value?.id).toBe('run-1')
    })

    it('returns null when no record exists', async () => {
      const result = await repo.findByJobAndDate('standup', '2099-01-01')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toBeNull()
    })
  })
})
