import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  updateStandupStatus: vi.fn(),
}))

vi.mock('../services/standup-service.js', () => ({
  updateStandupStatus: mocks.updateStandupStatus,
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

function makePatchRequest(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /standups/:id/status', () => {
  let app: ReturnType<typeof createStandupRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createStandupRouter({ databaseUrl: DATABASE_URL })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('atualiza status com sucesso', async () => {
    const updated = { ...standupRecord, status: 'pending_review' as const }
    mocks.updateStandupStatus.mockResolvedValue(Result.ok(updated))

    const res = await app.fetch(
      makePatchRequest('/standups/standup-abc/status', {
        status: 'pending_review',
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof updated }
    expect(body.data.status).toBe('pending_review')
    expect(mocks.updateStandupStatus).toHaveBeenCalledWith(
      'standup-abc',
      'pending_review',
      { databaseUrl: DATABASE_URL },
    )
  })

  it('retorna 400 para body sem status', async () => {
    const res = await app.fetch(
      makePatchRequest('/standups/standup-abc/status', {}),
    )

    expect(res.status).toBe(400)
    expect(mocks.updateStandupStatus).not.toHaveBeenCalled()
  })

  it('retorna 400 para status fora do enum', async () => {
    const res = await app.fetch(
      makePatchRequest('/standups/standup-abc/status', { status: 'invalid' }),
    )

    expect(res.status).toBe(400)
    expect(mocks.updateStandupStatus).not.toHaveBeenCalled()
  })

  it('retorna 404 quando standup não existe', async () => {
    mocks.updateStandupStatus.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-xyz' })),
    )

    const res = await app.fetch(
      makePatchRequest('/standups/standup-xyz/status', { status: 'approved' }),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 409 para transição de status inválida', async () => {
    mocks.updateStandupStatus.mockResolvedValue(
      Result.err(
        new InvalidStateTransitionError({ from: 'draft', to: 'published' }),
      ),
    )

    const res = await app.fetch(
      makePatchRequest('/standups/standup-abc/status', { status: 'published' }),
    )

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/invalid.*transition/i)
  })

  it('retorna 500 quando DbError', async () => {
    mocks.updateStandupStatus.mockResolvedValue(
      Result.err(
        new DbError({ operation: 'updateStatus', message: 'write failed' }),
      ),
    )

    const res = await app.fetch(
      makePatchRequest('/standups/standup-abc/status', {
        status: 'pending_review',
      }),
    )

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })
})
