import { DbError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upsertUserSettings: vi.fn(),
}))

vi.mock('../services/settings-service.js', () => ({
  upsertUserSettings: mocks.upsertUserSettings,
}))

import { Hono } from 'hono'
import { handlePutMySettings } from './put-me.js'

const DATABASE_URL = ':memory:'
const TEST_USER_ID = 'user-123'

const validPayload = {
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  gitAuthor: 'dev@example.com',
  gitSincePeriod: '16 hours ago',
  selectedRepos: ['agrotrace-web'],
  active: true,
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/settings/me', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PUT /settings/me', () => {
  let app: Hono<{ Variables: { user: Record<string, unknown> } }>

  beforeEach(() => {
    vi.clearAllMocks()
    app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    app.put('/settings/me', (c) => {
      return handlePutMySettings(c, { databaseUrl: DATABASE_URL })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 200 with { data } when payload is valid', async () => {
    mocks.upsertUserSettings.mockReturnValue(Result.ok(validPayload))

    const res = await app.fetch(makeRequest(validPayload))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof validPayload }
    expect(body.data).toEqual(validPayload)
    expect(mocks.upsertUserSettings).toHaveBeenCalledWith(
      {
        userId: TEST_USER_ID,
        ...validPayload,
      },
      { databaseUrl: DATABASE_URL },
    )
  })

  it('returns 401 when user is not authenticated', async () => {
    const unauthenticatedApp = new Hono()
    unauthenticatedApp.put('/settings/me', (c) => {
      return handlePutMySettings(c, { databaseUrl: DATABASE_URL })
    })

    const res = await unauthenticatedApp.fetch(makeRequest(validPayload))

    expect(res.status).toBe(401)
    expect(mocks.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('returns 400 with actionable errors for missing required strings', async () => {
    const res = await app.fetch(
      makeRequest({
        ...validPayload,
        gitSincePeriod: '',
        timezone: '',
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: string
      errors: Array<{ field: string; message: string }>
    }
    expect(body.error).toBe('Invalid settings payload')
    expect(body.errors).toEqual(
      expect.arrayContaining([
        {
          field: 'timezone',
          message: 'timezone is required',
        },
        {
          field: 'gitSincePeriod',
          message: 'gitSincePeriod is required',
        },
      ]),
    )
    expect(mocks.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('returns 400 when selectedRepos is empty', async () => {
    const res = await app.fetch(
      makeRequest({
        ...validPayload,
        selectedRepos: [],
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: string
      errors: Array<{ field: string; message: string }>
    }
    expect(body.error).toBe('Invalid settings payload')
    expect(body.errors).toContainEqual({
      field: 'selectedRepos',
      message: 'selectedRepos must include at least one repo',
    })
    expect(mocks.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('returns 400 when selectedRepos contains empty values', async () => {
    const res = await app.fetch(
      makeRequest({
        ...validPayload,
        selectedRepos: [''],
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      errors: Array<{ field: string; message: string }>
    }
    expect(body.errors).toContainEqual({
      field: 'selectedRepos.0',
      message: 'selectedRepos entries must be non-empty',
    })
    expect(mocks.upsertUserSettings).not.toHaveBeenCalled()
  })

  it('returns 500 when settings service fails', async () => {
    mocks.upsertUserSettings.mockReturnValue(
      Result.err(
        new DbError({
          operation: 'upsert',
          message: 'disk full',
        }),
      ),
    )

    const res = await app.fetch(makeRequest(validPayload))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })
})
