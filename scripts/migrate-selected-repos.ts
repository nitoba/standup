/**
 * One-time data migration: converts selectedRepos from ["repo-name"]
 * to ["project/repo-name"] format.
 *
 * Usage: bun run scripts/migrate-selected-repos.ts
 *
 * Requires: AZURE_DEVOPS_DEFAULT_PROJECT env var (defaults to 'AGROTRACE')
 * Requires: DATABASE_URL env var pointing to the database
 */
import { createClient } from '@libsql/client'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const DEFAULT_PROJECT = process.env.AZURE_DEVOPS_DEFAULT_PROJECT ?? 'AGROTRACE'

const client = createClient({
  url: DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

async function main() {
  console.log(
    `Migrating selectedRepos with default project: ${DEFAULT_PROJECT}`,
  )

  const rows = await client.execute(
    "SELECT id, selected_repos FROM user_settings WHERE selected_repos != '[]'",
  )

  let updated = 0
  let skipped = 0

  for (const row of rows.rows) {
    const id = row.id as string
    const raw = row.selected_repos as string

    try {
      const repos = JSON.parse(raw) as unknown[]
      if (!Array.isArray(repos)) {
        console.warn(`Skipping ${id}: not an array`)
        skipped++
        continue
      }

      const migrated = repos.map((name) => {
        if (typeof name !== 'string') return name
        if (name.includes('/')) return name // already migrated
        return `${DEFAULT_PROJECT}/${name}`
      })

      const newValue = JSON.stringify(migrated)
      if (newValue === raw) {
        skipped++
        continue
      }

      await client.execute({
        sql: 'UPDATE user_settings SET selected_repos = ? WHERE id = ?',
        args: [newValue, id],
      })
      updated++
      console.log(`Updated ${id}: ${raw} -> ${newValue}`)
    } catch (error) {
      console.error(`Failed to migrate ${id}: ${error}`)
      skipped++
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
