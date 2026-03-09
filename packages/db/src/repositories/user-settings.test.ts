import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../connection.js'
import { createTestDb } from '../connection.js'
import { UserSettingsRepository } from './user-settings.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupTables(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS user (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image      TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL UNIQUE REFERENCES user(id),
      standup_cron     TEXT NOT NULL DEFAULT '30 17 * * 1-5',
      reminder_cron    TEXT NOT NULL DEFAULT '20 17 * * 1-5',
      recovery_cron    TEXT NOT NULL DEFAULT '0 18 * * 1-5',
      timezone         TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
      selected_repos   TEXT NOT NULL DEFAULT '[]',
      git_author       TEXT NOT NULL,
      git_since_period TEXT NOT NULL DEFAULT '16 hours ago',
      active           INTEGER NOT NULL DEFAULT 1,
      snoozed_until    INTEGER,
      cancelled_date   TEXT,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    )
  `)
}

function seedUser(db: Db, id = 'user-1'): void {
  const now = Date.now()
  db.run(
    sql`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES (${id}, ${'Test User'}, ${`${id}@test.com`}, ${0}, ${now}, ${now})`,
  )
}

function makeInput(overrides?: Record<string, unknown>) {
  return {
    userId: 'user-1',
    selectedRepos: '["agrotrace-web","agrotrace-api"]',
    gitAuthor: 'user@test.com',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: Db
let repo: UserSettingsRepository

beforeEach(() => {
  db = createTestDb()
  setupTables(db)
  seedUser(db)
  repo = new UserSettingsRepository(db)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserSettingsRepository', () => {
  describe('findByUserId', () => {
    it('returns null when no settings exist', () => {
      const result = repo.findByUserId('user-1')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toBeNull()
    })

    it('returns the settings row when it exists', () => {
      repo.upsert(makeInput({ gitSincePeriod: '12 hours ago' }))
      const result = repo.findByUserId('user-1')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).not.toBeNull()
      expect(result.value?.userId).toBe('user-1')
      expect(result.value?.selectedRepos).toBe(
        '["agrotrace-web","agrotrace-api"]',
      )
      expect(result.value?.gitAuthor).toBe('user@test.com')
      expect(result.value?.gitSincePeriod).toBe('12 hours ago')
    })
  })

  describe('upsert', () => {
    it('creates a new settings row', () => {
      const result = repo.upsert(makeInput())
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.userId).toBe('user-1')
      expect(result.value.standupCron).toBe('30 17 * * 1-5')
      expect(result.value.timezone).toBe('America/Sao_Paulo')
      expect(result.value.gitSincePeriod).toBe('16 hours ago')
      expect(result.value.active).toBe(true)
      expect(result.value.snoozedUntil).toBeNull()
      expect(result.value.cancelledDate).toBeNull()
    })

    it('updates an existing settings row on conflict', () => {
      repo.upsert(makeInput())

      const result = repo.upsert(
        makeInput({
          standupCron: '0 18 * * 1-5',
          timezone: 'Europe/London',
          gitSincePeriod: '24 hours ago',
        }),
      )
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.standupCron).toBe('0 18 * * 1-5')
      expect(result.value.timezone).toBe('Europe/London')
      expect(result.value.gitSincePeriod).toBe('24 hours ago')
    })

    it('creates with custom values', () => {
      const result = repo.upsert(
        makeInput({
          standupCron: '0 9 * * 1-5',
          reminderCron: '50 8 * * 1-5',
          recoveryCron: '30 9 * * 1-5',
          timezone: 'US/Eastern',
          gitSincePeriod: '2 days ago',
          active: false,
        }),
      )
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.standupCron).toBe('0 9 * * 1-5')
      expect(result.value.reminderCron).toBe('50 8 * * 1-5')
      expect(result.value.recoveryCron).toBe('30 9 * * 1-5')
      expect(result.value.timezone).toBe('US/Eastern')
      expect(result.value.gitSincePeriod).toBe('2 days ago')
      expect(result.value.active).toBe(false)
    })

    it('keeps the existing gitSincePeriod when omitted on update', () => {
      repo.upsert(makeInput({ gitSincePeriod: '36 hours ago' }))

      const result = repo.upsert(
        makeInput({
          standupCron: '15 18 * * 1-5',
        }),
      )
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.standupCron).toBe('15 18 * * 1-5')
      expect(result.value.gitSincePeriod).toBe('36 hours ago')
    })
  })

  describe('findAllActive', () => {
    it('returns empty array when no settings exist', () => {
      const result = repo.findAllActive()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toEqual([])
    })

    it('returns only active settings', () => {
      seedUser(db, 'user-2')
      repo.upsert(makeInput({ active: true }))
      repo.upsert(
        makeInput({
          userId: 'user-2',
          active: false,
        }),
      )

      const result = repo.findAllActive()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.userId).toBe('user-1')
    })

    it('returns multiple active users', () => {
      seedUser(db, 'user-2')
      repo.upsert(makeInput())
      repo.upsert(makeInput({ userId: 'user-2' }))

      const result = repo.findAllActive()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toHaveLength(2)
    })
  })

  describe('updateSnoozedUntil', () => {
    it('sets snoozedUntil on an existing row', async () => {
      repo.upsert(makeInput())
      const future = Date.now() + 15 * 60_000

      const result = await repo.updateSnoozedUntil('user-1', future)
      expect(result.status).toBe('ok')

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.snoozedUntil).toBe(future)
    })

    it('clears snoozedUntil by setting null', async () => {
      repo.upsert(makeInput())
      await repo.updateSnoozedUntil('user-1', Date.now() + 60_000)
      await repo.updateSnoozedUntil('user-1', null)

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.snoozedUntil).toBeNull()
    })
  })

  describe('updateCancelledDate', () => {
    it('sets cancelledDate on an existing row', async () => {
      repo.upsert(makeInput())

      const result = await repo.updateCancelledDate('user-1', '2026-03-07')
      expect(result.status).toBe('ok')

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.cancelledDate).toBe('2026-03-07')
    })

    it('clears cancelledDate by setting null', async () => {
      repo.upsert(makeInput())
      await repo.updateCancelledDate('user-1', '2026-03-07')
      await repo.updateCancelledDate('user-1', null)

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.cancelledDate).toBeNull()
    })
  })

  describe('clearExpiredSnoozes', () => {
    it('clears snoozes that have expired', async () => {
      repo.upsert(makeInput())
      await repo.updateSnoozedUntil('user-1', Date.now() - 60_000)

      const result = await repo.clearExpiredSnoozes()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toBe(1)

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.snoozedUntil).toBeNull()
    })

    it('does not clear snoozes that are still in the future', async () => {
      repo.upsert(makeInput())
      const future = Date.now() + 15 * 60_000
      await repo.updateSnoozedUntil('user-1', future)

      const result = await repo.clearExpiredSnoozes()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toBe(0)

      const found = repo.findByUserId('user-1')
      if (found.status !== 'ok') return
      expect(found.value?.snoozedUntil).toBe(future)
    })

    it('returns 0 when no snoozes exist', async () => {
      const result = await repo.clearExpiredSnoozes()
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.value).toBe(0)
    })
  })
})
