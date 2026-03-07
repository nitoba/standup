import { DbError, NotFoundError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  getStandupById: vi.fn(),
}))

vi.mock('../services/standup-service.js', () => ({
  getStandupById: mocks.getStandupById,
}))

vi.mock('@standup/db', () => ({
  getDb: vi.fn(),
  UserRepository: vi.fn(),
}))

import { Hono } from 'hono'
import { createStandupRouter } from './router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'
const TEST_USER_ID = 'test-user-1'
const WORKER_INTERNAL_URL = 'http://localhost:3335'
const INTERNAL_SECRET = 'internal-secret'

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  status: 'draft' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

function makeGetRequest(url: string): Request {
  return new Request(`http://localhost${url}`, { method: 'GET' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /standups/:id', () => {
  let app: Hono<{ Variables: { user: Record<string, unknown> } }>

  beforeEach(() => {
    vi.clearAllMocks()
    const router = createStandupRouter({
      databaseUrl: DATABASE_URL,
      reposRootPath: '/repos',
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })
    app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    app.route('/', router)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna o standup quando encontrado', async () => {
    mocks.getStandupById.mockResolvedValue(Result.ok(standupRecord))

    const res = await app.fetch(makeGetRequest('/standups/standup-abc'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof standupRecord }
    expect(body.data.id).toBe('standup-abc')
    expect(body.data.content).toBe('## Standup\n\n- feat: add feature')
    expect(mocks.getStandupById).toHaveBeenCalledWith(
      'standup-abc',
      TEST_USER_ID,
      {
        databaseUrl: DATABASE_URL,
      },
    )
  })

  it('retorna 404 quando standup não existe', async () => {
    mocks.getStandupById.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-xyz' })),
    )

    const res = await app.fetch(makeGetRequest('/standups/standup-xyz'))

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 500 quando DbError', async () => {
    mocks.getStandupById.mockResolvedValue(
      Result.err(
        new DbError({ operation: 'findById', message: 'connection lost' }),
      ),
    )

    const res = await app.fetch(makeGetRequest('/standups/standup-abc'))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })
})
