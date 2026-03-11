import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDb } from './connection.js'

describe('createTestDb', () => {
  it('configures SQLite with WAL and busy timeout', async () => {
    const db = createTestDb()

    const busyTimeout = await db.get(sql.raw('PRAGMA busy_timeout'))
    const journalMode = await db.get(sql.raw('PRAGMA journal_mode'))
    const foreignKeys = await db.get(sql.raw('PRAGMA foreign_keys'))

    expect(busyTimeout).toEqual({ timeout: 5000 })
    expect(journalMode).toEqual({ journal_mode: 'wal' })
    expect(foreignKeys).toEqual({ foreign_keys: 1 })
  })
})
