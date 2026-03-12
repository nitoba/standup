import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../connection.js'
import { createTestDb } from '../connection.js'
import { UserRepository } from './user.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupTables(db: Db): Promise<void> {
  await db.run(sql`
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
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS account (
      id                       TEXT PRIMARY KEY,
      account_id               TEXT NOT NULL,
      provider_id              TEXT NOT NULL,
      user_id                  TEXT NOT NULL REFERENCES user(id),
      access_token             TEXT,
      refresh_token            TEXT,
      id_token                 TEXT,
      access_token_expires_at  INTEGER,
      refresh_token_expires_at INTEGER,
      scope                    TEXT,
      password                 TEXT,
      created_at               INTEGER NOT NULL,
      updated_at               INTEGER NOT NULL
    )
  `)
  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_unique
    ON account(provider_id, account_id)
  `)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS session (
      id         TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token      TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id    TEXT NOT NULL REFERENCES user(id)
    )
  `)
}

const NOW = Math.floor(Date.now() / 1000)

async function seedUser(db: Db, id = 'user-1'): Promise<void> {
  await db.run(
    sql`INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
        VALUES (${id}, ${'Test User'}, ${`${id}@test.com`}, ${0}, ${NOW}, ${NOW})`,
  )
}

async function seedAccount(
  db: Db,
  userId = 'user-1',
  discordId = 'discord-123',
): Promise<void> {
  await db.run(
    sql`INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
        VALUES (${`acc-${userId}`}, ${discordId}, ${'discord'}, ${userId}, ${NOW}, ${NOW})`,
  )
}

async function seedSession(
  db: Db,
  userId = 'user-1',
  expiresAtEpochSeconds = NOW + 86400,
  sessionId = 'session-1',
): Promise<void> {
  await db.run(
    sql`INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
        VALUES (${sessionId}, ${expiresAtEpochSeconds}, ${`token-${sessionId}`}, ${NOW}, ${NOW}, ${userId})`,
  )
}

// ---------------------------------------------------------------------------
// Tests: existing methods
// ---------------------------------------------------------------------------

describe('UserRepository', () => {
  let db: Db
  let repo: UserRepository

  beforeEach(async () => {
    db = createTestDb()
    await setupTables(db)
    repo = new UserRepository(db)
  })

  describe('findByDiscordId', () => {
    it('returns user when account exists', async () => {
      await seedUser(db)
      await seedAccount(db)

      const result = await repo.findByDiscordId('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).not.toBeNull()
        expect(result.value?.id).toBe('user-1')
        expect(result.value?.discordId).toBe('discord-123')
      }
    })

    it('returns null when account does not exist', async () => {
      const result = await repo.findByDiscordId('nonexistent')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })
  })

  describe('findUserIdByDiscordId', () => {
    it('returns userId when account exists', async () => {
      await seedUser(db)
      await seedAccount(db)

      const result = await repo.findUserIdByDiscordId('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBe('user-1')
      }
    })

    it('returns null when account does not exist', async () => {
      const result = await repo.findUserIdByDiscordId('nonexistent')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })
  })

  describe('findDiscordIdByUserId', () => {
    it('returns discordId when account exists', async () => {
      await seedUser(db)
      await seedAccount(db)

      const result = await repo.findDiscordIdByUserId('user-1')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBe('discord-123')
      }
    })

    it('returns null when account does not exist', async () => {
      const result = await repo.findDiscordIdByUserId('nonexistent')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: hasActiveSession
  // ---------------------------------------------------------------------------

  describe('hasActiveSession', () => {
    it('returns null when account does not exist', async () => {
      const result = await repo.hasActiveSession('nonexistent')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })

    it('returns { hasSession: false } when account exists but no sessions', async () => {
      await seedUser(db)
      await seedAccount(db)

      const result = await repo.hasActiveSession('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toEqual({
          userId: 'user-1',
          hasSession: false,
        })
      }
    })

    it('returns { hasSession: false } when all sessions are expired', async () => {
      await seedUser(db)
      await seedAccount(db)
      // Expired 1 hour ago
      await seedSession(db, 'user-1', NOW - 3600)

      const result = await repo.hasActiveSession('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toEqual({
          userId: 'user-1',
          hasSession: false,
        })
      }
    })

    it('returns { hasSession: true } when a non-expired session exists', async () => {
      await seedUser(db)
      await seedAccount(db)
      // Expires in 24 hours
      await seedSession(db, 'user-1', NOW + 86400)

      const result = await repo.hasActiveSession('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toEqual({
          userId: 'user-1',
          hasSession: true,
        })
      }
    })

    it('returns { hasSession: true } when at least one session is active among expired ones', async () => {
      await seedUser(db)
      await seedAccount(db)
      await seedSession(db, 'user-1', NOW - 3600, 'expired-session')
      await seedSession(db, 'user-1', NOW + 86400, 'active-session')

      const result = await repo.hasActiveSession('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toEqual({
          userId: 'user-1',
          hasSession: true,
        })
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Tests: deleteSessionsByDiscordId
  // ---------------------------------------------------------------------------

  describe('deleteSessionsByDiscordId', () => {
    it('returns null when account does not exist', async () => {
      const result = await repo.deleteSessionsByDiscordId('nonexistent')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBeNull()
      }
    })

    it('returns true and deletes all sessions for the user', async () => {
      await seedUser(db)
      await seedAccount(db)
      await seedSession(db, 'user-1', NOW + 86400, 'session-1')
      await seedSession(db, 'user-1', NOW + 86400, 'session-2')

      const result = await repo.deleteSessionsByDiscordId('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }

      // Verify sessions are gone
      const sessionCheck = await repo.hasActiveSession('discord-123')
      if (sessionCheck.isOk()) {
        expect(sessionCheck.value?.hasSession).toBe(false)
      }
    })

    it('returns true even when there are no sessions to delete', async () => {
      await seedUser(db)
      await seedAccount(db)

      const result = await repo.deleteSessionsByDiscordId('discord-123')

      expect(result.status).toBe('ok')
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }
    })

    it('does not delete sessions of other users', async () => {
      await seedUser(db, 'user-1')
      await seedUser(db, 'user-2')
      await seedAccount(db, 'user-1', 'discord-111')
      await seedAccount(db, 'user-2', 'discord-222')
      await seedSession(db, 'user-1', NOW + 86400, 'session-u1')
      await seedSession(db, 'user-2', NOW + 86400, 'session-u2')

      await repo.deleteSessionsByDiscordId('discord-111')

      // user-1 sessions gone
      const check1 = await repo.hasActiveSession('discord-111')
      if (check1.isOk()) {
        expect(check1.value?.hasSession).toBe(false)
      }

      // user-2 sessions intact
      const check2 = await repo.hasActiveSession('discord-222')
      if (check2.isOk()) {
        expect(check2.value?.hasSession).toBe(true)
      }
    })
  })
})
