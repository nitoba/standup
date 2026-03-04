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

import { createStandupRouter } from './router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'
const ALLOWED_DISCORD_USER_ID = 'discord-user-123'
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
  let app: ReturnType<typeof createStandupRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createStandupRouter({
      databaseUrl: DATABASE_URL,
      allowedDiscordUserId: ALLOWED_DISCORD_USER_ID,
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })
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
    expect(mocks.getStandupById).toHaveBeenCalledWith('standup-abc', {
      databaseUrl: DATABASE_URL,
    })
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
