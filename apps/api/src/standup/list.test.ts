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

import { createStandupRouter } from './router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'

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

describe('GET /standups', () => {
  let app: ReturnType<typeof createStandupRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createStandupRouter({ databaseUrl: DATABASE_URL })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna array vazio quando não há standups', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok([]))

    const res = await app.fetch(makeGetRequest('/standups'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
    expect(mocks.listStandups).toHaveBeenCalledWith(
      { status: undefined, date: undefined },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('retorna todos os standups sem filtros', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok([standupRecord]))

    const res = await app.fetch(makeGetRequest('/standups'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: (typeof standupRecord)[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe('standup-abc')
  })

  it('passa filtro de status para o service', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok([standupRecord]))

    const res = await app.fetch(makeGetRequest('/standups?status=draft'))

    expect(res.status).toBe(200)
    expect(mocks.listStandups).toHaveBeenCalledWith(
      { status: 'draft', date: undefined },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('passa filtro de date para o service', async () => {
    mocks.listStandups.mockResolvedValue(Result.ok([standupRecord]))

    const res = await app.fetch(makeGetRequest('/standups?date=2026-03-04'))

    expect(res.status).toBe(200)
    expect(mocks.listStandups).toHaveBeenCalledWith(
      { status: undefined, date: '2026-03-04' },
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
