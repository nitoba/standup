import { Database } from 'bun:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServiceLogger } from '@standup/logger'

import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const logger = createServiceLogger({
  service: 'db',
  component: 'migrator',
})

const DRIZZLE_MIGRATIONS_TABLE = '__drizzle_migrations'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function countSqlMigrationFiles(migrationsFolder: string): number {
  return readdirSync(migrationsFolder, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.sql'),
  ).length
}

function getKnownMigrationsCount(migrationsFolder: string): number {
  const journalPath = resolve(migrationsFolder, 'meta', '_journal.json')

  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries?: unknown
    }

    if (Array.isArray(journal.entries)) {
      return journal.entries.length
    }

    throw new Error('journal entries is not an array')
  } catch (error) {
    logger.warn('Could not read Drizzle migration journal, falling back to .sql file count', {
      error: getErrorMessage(error),
      journalPath,
    })

    return countSqlMigrationFiles(migrationsFolder)
  }
}

function hasMigrationsTable(sqlite: Database): boolean {
  const row = sqlite
    .query(
      `select name from sqlite_master where type = 'table' and name = '${DRIZZLE_MIGRATIONS_TABLE}'`,
    )
    .get() as { name: string } | null

  return row !== null
}

function getAppliedMigrationsCount(sqlite: Database): number {
  if (!hasMigrationsTable(sqlite)) {
    return 0
  }

  const row = sqlite
    .query(
      `select count(*) as count from "${DRIZZLE_MIGRATIONS_TABLE}"`,
    )
    .get() as { count: number } | null

  if (!row) {
    return 0
  }

  return Number(row.count ?? 0)
}

const databaseUrl = process.env.DATABASE_URL ?? './data/standup.db'
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

if (databaseUrl !== ':memory:' && !databaseUrl.startsWith('file:')) {
  const databasePath = resolve(process.cwd(), databaseUrl)
  mkdirSync(dirname(databasePath), { recursive: true })
}

const sqlite = new Database(databaseUrl, { create: true })
sqlite.run('PRAGMA journal_mode=WAL')
sqlite.run('PRAGMA foreign_keys=ON')

const db = drizzle(sqlite)

try {
  const knownMigrations = getKnownMigrationsCount(migrationsFolder)
  const appliedBefore = getAppliedMigrationsCount(sqlite)
  const pendingBefore = Math.max(knownMigrations - appliedBefore, 0)
  const startedAt = Date.now()

  logger.info('Starting migration run', {
    databaseUrl,
    migrationsFolder,
    knownMigrations,
    appliedMigrations: appliedBefore,
    pendingMigrations: pendingBefore,
  })

  if (pendingBefore === 0) {
    logger.info('No pending migrations detected')
  }

  migrate(db, { migrationsFolder })

  const appliedAfter = getAppliedMigrationsCount(sqlite)
  const executedMigrations = Math.max(appliedAfter - appliedBefore, 0)
  const pendingAfter = Math.max(knownMigrations - appliedAfter, 0)
  const durationMs = Date.now() - startedAt

  logger.info('Migration run finished', {
    executedMigrations,
    appliedMigrations: appliedAfter,
    pendingMigrations: pendingAfter,
    durationMs,
  })
} catch (error) {
  logger.error('Migration run failed', {
    error: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
    databaseUrl,
    migrationsFolder,
  })
  process.exitCode = 1
} finally {
  try {
    sqlite.close()
  } catch (error) {
    logger.warn('Failed to close SQLite connection after migration run', {
      error: getErrorMessage(error),
    })
  }
}
