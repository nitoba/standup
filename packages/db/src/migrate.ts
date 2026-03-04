import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServiceLogger } from '@standup/logger'

import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const logger = createServiceLogger({
  service: 'db',
  component: 'migrator',
})

logger.info('Running migrations...')

const databaseUrl = process.env.DATABASE_URL ?? './data/standup.db'

if (databaseUrl !== ':memory:' && !databaseUrl.startsWith('file:')) {
  const databasePath = resolve(process.cwd(), databaseUrl)
  mkdirSync(dirname(databasePath), { recursive: true })
}

const sqlite = new Database(databaseUrl, { create: true })

const db = drizzle(sqlite)

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))

migrate(db, { migrationsFolder })

logger.info('Migrations applied!')
