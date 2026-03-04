import { NotFoundError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — inicialização antes do hoist de vi.mock
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  repoFindById: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  sendReviewDm: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks de módulos
// ---------------------------------------------------------------------------

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return { findById: mocks.repoFindById }
  }
  return { getDb: mocks.getDb, StandupRepository }
})

vi.mock('../discord/send-review-dm.js', () => ({
  sendReviewDm: mocks.sendReviewDm,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import { createInternalRouter } from './internal-routes.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const DATABASE_URL = ':memory:'

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: '',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  status: 'draft' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (secret !== null) {
    headers['x-internal-secret'] = secret
  }
  return new Request('http://localhost/internal/notify/standup-ready', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /internal/notify/standup-ready', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: DATABASE_URL,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando x-internal-secret está ausente', async () => {
    const req = makeRequest({ standupId: 'standup-abc' }, null)
    const res = await app.fetch(req)

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('retorna 401 quando x-internal-secret está incorreto', async () => {
    const req = makeRequest({ standupId: 'standup-abc' }, 'wrong-secret')
    const res = await app.fetch(req)

    expect(res.status).toBe(401)
  })

  it('retorna 400 quando standupId está ausente no body', async () => {
    const req = makeRequest({})
    const res = await app.fetch(req)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/standupId/i)
  })

  it('retorna 404 quando standup não existe no banco', async () => {
    mocks.repoFindById.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-abc' })),
    )

    const req = makeRequest({ standupId: 'standup-abc' })
    const res = await app.fetch(req)

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 200 e envia DM quando tudo está correto', async () => {
    mocks.repoFindById.mockResolvedValue(Result.ok(standupRecord))
    mocks.sendReviewDm.mockResolvedValue(Result.ok(undefined))

    const req = makeRequest({ standupId: 'standup-abc' })
    const res = await app.fetch(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; standupId: string }
    expect(body.ok).toBe(true)
    expect(body.standupId).toBe('standup-abc')
    expect(mocks.repoFindById).toHaveBeenCalledWith('standup-abc')
    expect(mocks.sendReviewDm).toHaveBeenCalledWith(standupRecord)
  })

  it('retorna 200 mesmo quando envio de DM falha (non-fatal)', async () => {
    mocks.repoFindById.mockResolvedValue(Result.ok(standupRecord))
    mocks.sendReviewDm.mockResolvedValue(
      Result.err(
        new NotFoundError({ resource: 'discord-user', id: 'unknown' }),
      ),
    )

    const req = makeRequest({ standupId: 'standup-abc' })
    const res = await app.fetch(req)

    // A notificação foi aceita com sucesso; falha no DM é non-fatal (bot loga e continua)
    expect(res.status).toBe(200)
    expect(mocks.repoFindById).toHaveBeenCalledOnce()
    expect(mocks.sendReviewDm).toHaveBeenCalledOnce()
  })
})
