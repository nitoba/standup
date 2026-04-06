import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('0005_convert_published_status migration', () => {
  it('separates each SQL statement with drizzle statement breakpoints', () => {
    const filePath = resolve(
      process.cwd(),
      'src/platform/database/migrations/0005_convert_published_status.sql',
    )
    const sql = readFileSync(filePath, 'utf8')

    const statements = sql
      .split('--> statement-breakpoint')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)

    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain("UPDATE standups SET status = 'approved'")
    expect(statements[1]).toContain('DELETE FROM standups WHERE id IN')
  })
})
