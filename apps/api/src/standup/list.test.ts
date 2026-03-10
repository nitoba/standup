import { DbError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  listStandups: vi.fn(),
}))

vi.mock('../services/standup-service.js', () => ({
  listStandups: mocks.listStandups,
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

const paginatedStandupResult = {
  items: [standupRecord],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  summary: {
    total: 1,
    approved: 0,
    pending: 0,
    rejected: 0,
  },
}

function makeGetRequest(url: string): Request {
  return new Request(`http://localhost${url}`, { method: 'GET' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /standups', () => {
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

  it('retorna array vazio quando não há standups', async () => {
    mocks.listStandups.mockResolvedValue(
      Result.ok({
        ...paginatedStandupResult,
        items: [],
        total: 0,
        totalPages: 0,
        summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
      }),
    )

    const res = await app.fetch(makeGetRequest('/standups'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: unknown[]
      pagination: { total: number }
    }
    expect(body.data).toEqual([])
    expect(mocks.listStandups).toHaveBeenCalledWith(
      {
        status: undefined,
        date: undefined,
        search: undefined,
        page: 1,
        pageSize: 20,
        userId: TEST_USER_ID,
      },
      { databaseUrl: DATABASE_URL },
    )
    expect(body.pagination.total).toBe(0)
  })

  it('retorna todos os standups sem filtros', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok(paginatedStandupResult))

    const res = await app.fetch(makeGetRequest('/standups'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: (typeof standupRecord)[]
      pagination: {
        page: number
        pageSize: number
        total: number
        totalPages: number
      }
      summary: { total: number }
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe('standup-abc')
    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
    expect(body.summary.total).toBe(1)
  })

  it('passa filtro de status para o service', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok(paginatedStandupResult))

    const res = await app.fetch(makeGetRequest('/standups?status=draft'))

    expect(res.status).toBe(200)
    expect(mocks.listStandups).toHaveBeenCalledWith(
      {
        status: 'draft',
        date: undefined,
        search: undefined,
        page: 1,
        pageSize: 20,
        userId: TEST_USER_ID,
      },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('passa filtro de date para o service', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok(paginatedStandupResult))

    const res = await app.fetch(makeGetRequest('/standups?date=2026-03-04'))

    expect(res.status).toBe(200)
    expect(mocks.listStandups).toHaveBeenCalledWith(
      {
        status: undefined,
        date: '2026-03-04',
        search: undefined,
        page: 1,
        pageSize: 20,
        userId: TEST_USER_ID,
      },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('passa paginação e search para o service', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok(paginatedStandupResult))

    const res = await app.fetch(
      makeGetRequest('/standups?search=retry&page=2&pageSize=5'),
    )

    expect(res.status).toBe(200)
    expect(mocks.listStandups).toHaveBeenCalledWith(
      {
        status: undefined,
        date: undefined,
        search: 'retry',
        page: 2,
        pageSize: 5,
        userId: TEST_USER_ID,
      },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('retorna 400 para status inválido', async () => {
    const res = await app.fetch(
      makeGetRequest('/standups?status=invalid-status'),
    )

    expect(res.status).toBe(400)
    expect(mocks.listStandups).not.toHaveBeenCalled()
  })

  it('retorna 400 para date com formato inválido', async () => {
    const res = await app.fetch(makeGetRequest('/standups?date=04-03-2026'))

    expect(res.status).toBe(400)
    expect(mocks.listStandups).not.toHaveBeenCalled()
  })

  it('retorna 500 quando DbError', async () => {
    mocks.listStandups.mockResolvedValue(
      Result.err(new DbError({ operation: 'list', message: 'disk full' })),
    )

    const res = await app.fetch(makeGetRequest('/standups'))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })
})
