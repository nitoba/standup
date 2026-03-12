import { DbError, Result } from '@standup/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserSettingsOrDefaults: vi.fn(),
}))

vi.mock('../../../services/settings-service.js', () => ({
  getUserSettingsOrDefaults: mocks.getUserSettingsOrDefaults,
}))

import { Hono } from 'hono'
import { registerGetMeSettingsRoute } from './get-me.js'

const DATABASE_URL = ':memory:'
const TEST_USER_ID = 'user-123'

const persistedSettings = {
  standupCron: '0 9 * * 1-5',
  reminderCron: '50 8 * * 1-5',
  recoveryCron: '30 9 * * 1-5',
  timezone: 'Europe/London',
  gitAuthor: 'dev@example.com',
  gitSincePeriod: '24 hours ago',
  selectedRepos: ['repo-a', 'repo-b'],
  active: true,
  snoozedUntil: null,
  cancelledDate: null,
}

function createApp(user?: Record<string, unknown>) {
  const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()

  app.use('*', async (c, next) => {
    if (user) {
      c.set('user', user)
    }

    return next()
  })

  registerGetMeSettingsRoute(app, { databaseUrl: DATABASE_URL })

  return app
}

describe('GET /settings/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns persisted settings for the authenticated user', async () => {
    mocks.getUserSettingsOrDefaults.mockReturnValue(
      Result.ok(persistedSettings),
    )
    const app = createApp({ id: TEST_USER_ID })

    const res = await app.fetch(new Request('http://localhost/settings/me'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: persistedSettings })
    expect(mocks.getUserSettingsOrDefaults).toHaveBeenCalledWith(TEST_USER_ID, {
      databaseUrl: DATABASE_URL,
    })
  })

  it('returns safe defaults for first login', async () => {
    const defaults = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: '',
      gitSincePeriod: '8 hours ago',
      selectedRepos: [],
      active: true,
      snoozedUntil: null,
      cancelledDate: null,
    }
    mocks.getUserSettingsOrDefaults.mockReturnValue(Result.ok(defaults))
    const app = createApp({ id: TEST_USER_ID })

    const res = await app.fetch(new Request('http://localhost/settings/me'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: defaults })
  })

  it('uses only the authenticated session identity', async () => {
    mocks.getUserSettingsOrDefaults.mockReturnValue(
      Result.ok(persistedSettings),
    )
    const app = createApp({ id: TEST_USER_ID })

    const res = await app.fetch(
      new Request('http://localhost/settings/me?userId=attacker-id'),
    )

    expect(res.status).toBe(200)
    expect(mocks.getUserSettingsOrDefaults).toHaveBeenCalledWith(TEST_USER_ID, {
      databaseUrl: DATABASE_URL,
    })
    expect(mocks.getUserSettingsOrDefaults).not.toHaveBeenCalledWith(
      'attacker-id',
      expect.anything(),
    )
  })

  it('returns 401 when there is no authenticated session', async () => {
    const app = createApp()

    const res = await app.fetch(new Request('http://localhost/settings/me'))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.getUserSettingsOrDefaults).not.toHaveBeenCalled()
  })

  it('returns 500 when the settings facade fails', async () => {
    mocks.getUserSettingsOrDefaults.mockReturnValue(
      Result.err(
        new DbError({
          operation: 'findByUserId',
          message: 'database offline',
        }),
      ),
    )
    const app = createApp({ id: TEST_USER_ID })

    const res = await app.fetch(new Request('http://localhost/settings/me'))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
