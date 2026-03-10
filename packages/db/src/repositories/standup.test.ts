import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../connection.js'
import { createTestDb } from '../connection.js'
import { StandupRepository } from './standup.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupTables(db: Db): Promise<void> {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS standups (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      meeting_type TEXT NOT NULL,
      content     TEXT NOT NULL,
      source_data TEXT NOT NULL,
      custom_entries TEXT,
      status      TEXT NOT NULL DEFAULT 'draft',
      user_id     TEXT REFERENCES user(id),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `)
  // Seed a test user for FK constraints
  db.run(
    sql`INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('test-user-1', 'Test User', 'test@test.com', 0, 1000, 1000)`,
  )
}

function makeInput(
  overrides?: Partial<Parameters<StandupRepository['create']>[0]>,
) {
  return {
    id: 'test-id-1',
    date: '04/03/2026',
    meetingType: 'Daily standup',
    content: '**Standup 04/03/2026**\n\n✅ Done: feature X',
    sourceData: JSON.stringify({
      timestamp: new Date().toISOString(),
      repos: [],
    }),
    userId: 'test-user-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: Db
let repo: StandupRepository

beforeEach(async () => {
  db = createTestDb()
  await setupTables(db)
  repo = new StandupRepository(db)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StandupRepository', () => {
  describe('create', () => {
    it('creates a standup and returns it with status draft', async () => {
      const result = await repo.create(makeInput())

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.id).toBe('test-id-1')
      expect(result.value.date).toBe('04/03/2026')
      expect(result.value.meetingType).toBe('Daily standup')
      expect(result.value.status).toBe('draft')
      expect(result.value.createdAt).toBeGreaterThan(0)
      expect(result.value.updatedAt).toBeGreaterThan(0)
    })

    it('returns DbError on duplicate id', async () => {
      await repo.create(makeInput())
      const result = await repo.create(makeInput())

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('DbError')
    })
  })

  describe('findById', () => {
    it('returns the standup when found', async () => {
      await repo.create(makeInput())
      const result = await repo.findById('test-id-1')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.id).toBe('test-id-1')
    })

    it('returns NotFoundError when standup does not exist', async () => {
      const result = await repo.findById('non-existent-id')

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })

  describe('findByDate', () => {
    it('returns all standups for a given date', async () => {
      await repo.create(makeInput({ id: 'a', date: '04/03/2026' }))
      await repo.create(makeInput({ id: 'b', date: '04/03/2026' }))
      await repo.create(makeInput({ id: 'c', date: '05/03/2026' }))

      const result = await repo.findByDate('04/03/2026')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(2)
      expect(result.value.map((r) => r.id).sort()).toEqual(['a', 'b'])
    })

    it('returns empty array when no standups found for date', async () => {
      const result = await repo.findByDate('01/01/2000')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(0)
    })
  })

  describe('findByStatus', () => {
    it('returns standups filtered by status', async () => {
      await repo.create(makeInput({ id: 'draft-1' }))
      await repo.create(makeInput({ id: 'draft-2' }))
      const created = await repo.create(makeInput({ id: 'review-1' }))
      if (created.status === 'ok') {
        await repo.updateStatus('review-1', 'pending_review')
      }

      const result = await repo.findByStatus('draft')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(2)
      expect(result.value.every((r) => r.status === 'draft')).toBe(true)
    })
  })

  describe('list', () => {
    it('returns all standups when no filters provided', async () => {
      await repo.create(makeInput({ id: 'x1' }))
      await repo.create(makeInput({ id: 'x2' }))
      await repo.create(makeInput({ id: 'x3' }))

      const result = await repo.list()

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(3)
    })

    it('filters by status', async () => {
      await repo.create(makeInput({ id: 'p1' }))
      const c2 = await repo.create(makeInput({ id: 'p2' }))
      if (c2.status === 'ok') await repo.updateStatus('p2', 'pending_review')

      const result = await repo.list({ status: 'pending_review' })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.id).toBe('p2')
    })

    it('filters by date', async () => {
      await repo.create(makeInput({ id: 'd1', date: '10/03/2026' }))
      await repo.create(makeInput({ id: 'd2', date: '10/03/2026' }))
      await repo.create(makeInput({ id: 'd3', date: '11/03/2026' }))

      const result = await repo.list({ date: '10/03/2026' })

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value).toHaveLength(2)
    })
  })

  describe('updateStatus', () => {
    it('transitions from draft to pending_review', async () => {
      await repo.create(makeInput())

      const result = await repo.updateStatus('test-id-1', 'pending_review')

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.status).toBe('pending_review')
    })

    it('transitions through the full approval flow', async () => {
      await repo.create(makeInput())

      await repo.updateStatus('test-id-1', 'pending_review')
      await repo.updateStatus('test-id-1', 'approved')
      const published = await repo.updateStatus('test-id-1', 'published')

      expect(published.status).toBe('ok')
      if (published.status !== 'ok') return

      expect(published.value.status).toBe('published')
    })

    it('transitions through the rejection flow', async () => {
      await repo.create(makeInput())

      await repo.updateStatus('test-id-1', 'pending_review')
      const rejected = await repo.updateStatus('test-id-1', 'rejected')

      expect(rejected.status).toBe('ok')
      if (rejected.status !== 'ok') return

      expect(rejected.value.status).toBe('rejected')
    })

    it('returns InvalidStateTransitionError for invalid transition', async () => {
      await repo.create(makeInput())

      // draft → published is not allowed
      const result = await repo.updateStatus('test-id-1', 'published')

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('InvalidStateTransitionError')
    })

    it('returns NotFoundError when standup does not exist', async () => {
      const result = await repo.updateStatus('ghost-id', 'pending_review')

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })

    it('updatedAt is refreshed after transition', async () => {
      await repo.create(makeInput())
      const before = await repo.findById('test-id-1')
      if (before.status !== 'ok') return

      // Small sleep to ensure timestamp changes
      await Bun.sleep(5)

      await repo.updateStatus('test-id-1', 'pending_review')
      const after = await repo.findById('test-id-1')
      if (after.status !== 'ok') return

      expect(after.value.updatedAt).toBeGreaterThanOrEqual(
        before.value.updatedAt,
      )
    })
  })

  describe('updateStatusForUser', () => {
    it('atualiza status quando o standup pertence ao usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.updateStatusForUser(
        'test-id-1',
        'test-user-1',
        'pending_review',
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.status).toBe('pending_review')
    })

    it('retorna NotFoundError quando o standup pertence a outro usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.updateStatusForUser(
        'test-id-1',
        'other-user',
        'pending_review',
      )

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })

  describe('updateContent', () => {
    it('updates the content of an existing standup', async () => {
      await repo.create(makeInput())

      const result = await repo.updateContent(
        'test-id-1',
        'Updated content here',
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.content).toBe('Updated content here')
    })

    it('returns NotFoundError when standup does not exist', async () => {
      const result = await repo.updateContent('ghost-id', 'content')

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })

  describe('updateContentForUser', () => {
    it('atualiza o conteúdo quando o standup pertence ao usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.updateContentForUser(
        'test-id-1',
        'test-user-1',
        'Updated content here',
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.content).toBe('Updated content here')
    })

    it('retorna NotFoundError quando o standup pertence a outro usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.updateContentForUser(
        'test-id-1',
        'other-user',
        'content',
      )

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })

  describe('updateCustomEntries', () => {
    it('saves and returns custom entries as structured object', async () => {
      await repo.create(makeInput())

      const entries = {
        scheduledMeetings: ['Planning Backend', 'Refinamento mobile'],
        directCalls: ['Call com Joao sobre deploy'],
      }
      const result = await repo.updateCustomEntries('test-id-1', entries)

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.customEntries).toEqual(entries)
    })

    it('persists custom entries and reads them back correctly', async () => {
      await repo.create(makeInput())

      const entries = {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com QA'],
      }
      await repo.updateCustomEntries('test-id-1', entries)

      const found = await repo.findById('test-id-1')
      expect(found.status).toBe('ok')
      if (found.status !== 'ok') return

      expect(found.value.customEntries).toEqual(entries)
    })

    it('returns null customEntries when not set', async () => {
      await repo.create(makeInput())

      const found = await repo.findById('test-id-1')
      expect(found.status).toBe('ok')
      if (found.status !== 'ok') return

      expect(found.value.customEntries).toBeNull()
    })

    it('returns NotFoundError when standup does not exist', async () => {
      const entries = {
        scheduledMeetings: [],
        directCalls: ['Call'],
      }
      const result = await repo.updateCustomEntries('ghost-id', entries)

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })

    it('updates updatedAt timestamp', async () => {
      await repo.create(makeInput())
      const before = await repo.findById('test-id-1')
      if (before.status !== 'ok') return

      await Bun.sleep(5)

      const entries = {
        scheduledMeetings: ['Meeting'],
        directCalls: [],
      }
      const result = await repo.updateCustomEntries('test-id-1', entries)
      if (result.status !== 'ok') return

      expect(result.value.updatedAt).toBeGreaterThanOrEqual(
        before.value.updatedAt,
      )
    })
  })

  describe('updateCustomEntriesForUser', () => {
    it('salva custom entries quando o standup pertence ao usuário', async () => {
      await repo.create(makeInput())

      const entries = {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com QA'],
      }
      const result = await repo.updateCustomEntriesForUser(
        'test-id-1',
        'test-user-1',
        entries,
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.customEntries).toEqual(entries)
    })

    it('retorna NotFoundError quando o standup pertence a outro usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.updateCustomEntriesForUser(
        'test-id-1',
        'other-user',
        {
          scheduledMeetings: ['Planning Backend'],
          directCalls: [],
        },
      )

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })

  describe('replaceGeneratedForUser', () => {
    it('substitui o conteúdo gerado mantendo o mesmo registro', async () => {
      await repo.create(makeInput())
      await repo.updateStatus('test-id-1', 'pending_review')
      await repo.updateCustomEntries('test-id-1', {
        scheduledMeetings: ['Planning'],
        directCalls: ['Sync'],
      })

      const result = await repo.replaceGeneratedForUser(
        'test-id-1',
        'test-user-1',
        {
          meetingType: 'Start of week meeting',
          content: '**Standup atualizado**\n\n- item novo',
          sourceData: '{"repos":[]}',
        },
      )

      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return

      expect(result.value.id).toBe('test-id-1')
      expect(result.value.createdAt).toBeGreaterThan(0)
      expect(result.value.status).toBe('draft')
      expect(result.value.customEntries).toBeNull()
      expect(result.value.content).toContain('item novo')

      const found = await repo.findById('test-id-1')
      expect(found.status).toBe('ok')
      if (found.status !== 'ok') return

      expect(found.value.id).toBe('test-id-1')
      expect(found.value.status).toBe('draft')
      expect(found.value.customEntries).toBeNull()
      expect(found.value.sourceData).toBe('{"repos":[]}')
    })

    it('retorna NotFoundError quando o standup pertence a outro usuário', async () => {
      await repo.create(makeInput())

      const result = await repo.replaceGeneratedForUser(
        'test-id-1',
        'other-user',
        {
          meetingType: 'Daily standup',
          content: 'novo conteúdo',
          sourceData: '{}',
        },
      )

      expect(result.status).toBe('error')
      if (result.status !== 'error') return

      expect(result.error._tag).toBe('NotFoundError')
    })
  })
})
