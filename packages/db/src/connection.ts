import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Client, createClient } from '@libsql/client/node'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.js'

export type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | null = null
let _client: Client | null = null
let _connectionKey: string | null = null

function normalizeDatabaseUrl(url: string): string {
  if (
    url === ':memory:' ||
    url.startsWith('file:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('ws://') ||
    url.startsWith('wss://') ||
    url.startsWith('libsql://') ||
    url.startsWith('turso://')
  ) {
    return url
  }

  return `file:${url}`
}

function createDb(url: string, authToken?: string): { client: Client; db: Db } {
  const client = createClient({
    url: normalizeDatabaseUrl(url),
    authToken: authToken ?? process.env.DATABASE_AUTH_TOKEN,
  })

  return {
    client,
    db: drizzle({ client, schema }),
  }
}

/**
 * Returns the singleton Drizzle database instance.
 * On first call, opens the SQLite file at `url` and enables WAL mode.
 *
 * Pass `:memory:` for in-process testing.
 */
export function getDb(url: string, authToken?: string): Db {
  const resolvedAuthToken = authToken ?? process.env.DATABASE_AUTH_TOKEN
  const connectionKey = `${normalizeDatabaseUrl(url)}::${resolvedAuthToken ?? ''}`

  if (_db && _connectionKey === connectionKey) {
    return _db
  }

  _client?.close()

  const { client, db } = createDb(url, resolvedAuthToken)
  _client = client
  _db = db
  _connectionKey = connectionKey
  return _db
}

/**
 * Creates a fresh isolated DB — intended for tests only.
 * Each call returns a NEW instance (no singleton).
 */
export function createTestDb(): Db {
  const tempDir = mkdtempSync(join(tmpdir(), 'standup-db-test-'))
  return createDb(`file:${join(tempDir, 'test.db')}`).db
}

/** Resets the singleton — for use in integration tests only. */
export function resetDbSingleton(): void {
  _client?.close()
  _client = null
  _db = null
  _connectionKey = null
}
