import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema.js'

export type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | null = null

/**
 * Returns the singleton Drizzle database instance.
 * On first call, opens the SQLite file at `url` and enables WAL mode.
 *
 * Pass `:memory:` for in-process testing.
 */
export function getDb(url: string): Db {
  if (_db) return _db

  const sqlite = new Database(url, { create: true })
  // Enable WAL for concurrent read access (bot + scheduler + API)
  sqlite.run('PRAGMA journal_mode=WAL')
  sqlite.run('PRAGMA foreign_keys=ON')

  _db = drizzle(sqlite, { schema })
  return _db
}

/**
 * Creates a fresh isolated DB — intended for tests only.
 * Each call returns a NEW instance (no singleton).
 */
export function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  sqlite.run('PRAGMA journal_mode=WAL')
  return drizzle(sqlite, { schema })
}

/** Resets the singleton — for use in integration tests only. */
export function resetDbSingleton(): void {
  _db = null
}
