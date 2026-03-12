import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Client,
  createClient,
  type InStatement,
} from '@libsql/client/node'
import { createServiceLogger } from '@standup/logger'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

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

function isLocalDatabaseUrl(url: string): boolean {
  return url === ':memory:' || url.startsWith('file:')
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
    logger.warn(
      'Could not read Drizzle migration journal, falling back to .sql file count',
      {
        error: getErrorMessage(error),
        journalPath,
      },
    )

    return countSqlMigrationFiles(migrationsFolder)
  }
}

async function getFirstRow<T>(
  client: Client,
  stmt: InStatement,
): Promise<T | null> {
  const result = await client.execute(stmt)
  return (result.rows[0] as T | undefined) ?? null
}

async function getAllRows<T>(client: Client, stmt: InStatement): Promise<T[]> {
  const result = await client.execute(stmt)
  return result.rows as T[]
}

async function hasMigrationsTable(client: Client): Promise<boolean> {
  const row = await getFirstRow<{ name: string }>(client, {
    sql: `select name from sqlite_master where type = 'table' and name = '${DRIZZLE_MIGRATIONS_TABLE}'`,
  })

  return row !== null
}

async function getAppliedMigrationsCount(client: Client): Promise<number> {
  if (!(await hasMigrationsTable(client))) {
    return 0
  }

  const row = await getFirstRow<{ count: number | string }>(client, {
    sql: `select count(*) as count from "${DRIZZLE_MIGRATIONS_TABLE}"`,
  })

  if (!row) {
    return 0
  }

  return Number(row.count ?? 0)
}

async function getDuplicateDiscordAccounts(client: Client): Promise<
  Array<{
    providerId: string
    accountId: string
    count: number
  }>
> {
  const rows = await getAllRows<{
    providerId: string
    accountId: string
    count: number | string
  }>(client, {
    sql: `
      select
        provider_id as providerId,
        account_id as accountId,
        count(*) as count
      from account
      group by provider_id, account_id
      having count(*) > 1
    `,
  })

  return rows.map((row) => ({
    providerId: row.providerId,
    accountId: row.accountId,
    count: Number(row.count),
  }))
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? './data/standup.db'
  const databaseAuthToken = process.env.DATABASE_AUTH_TOKEN
  const normalizedDatabaseUrl = normalizeDatabaseUrl(databaseUrl)
  const migrationsFolder = fileURLToPath(
    new URL('./migrations', import.meta.url),
  )

  if (
    isLocalDatabaseUrl(normalizedDatabaseUrl) &&
    normalizedDatabaseUrl !== ':memory:'
  ) {
    const databasePath = resolve(
      process.cwd(),
      normalizedDatabaseUrl.replace(/^file:/, ''),
    )
    mkdirSync(dirname(databasePath), { recursive: true })
  }

  const client = createClient({
    url: normalizedDatabaseUrl,
    authToken: databaseAuthToken,
  })

  const db = drizzle({ client })

  try {
    const knownMigrations = getKnownMigrationsCount(migrationsFolder)
    const appliedBefore = await getAppliedMigrationsCount(client)
    const pendingBefore = Math.max(knownMigrations - appliedBefore, 0)
    const startedAt = Date.now()

    logger.info('Starting migration run', {
      databaseUrl: normalizedDatabaseUrl,
      migrationsFolder,
      knownMigrations,
      appliedMigrations: appliedBefore,
      pendingMigrations: pendingBefore,
    })

    if (pendingBefore === 0) {
      logger.info('No pending migrations detected')
    }

    await migrate(db, { migrationsFolder })

    const appliedAfter = await getAppliedMigrationsCount(client)
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
      databaseUrl: normalizedDatabaseUrl,
      migrationsFolder,
    })
    process.exitCode = 1
  } finally {
    client.close()
  }
}

await main()
