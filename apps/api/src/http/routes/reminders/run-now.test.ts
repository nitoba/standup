import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  findDiscordIdByUserId: vi.fn(),
  findSettingsByUserId: vi.fn(),
  triggerStandupJob: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function UserRepository() {
    return {
      findDiscordIdByUserId: mocks.findDiscordIdByUserId,
    }
  }

  function UserSettingsRepository() {
    return {
      findByUserId: mocks.findSettingsByUserId,
    }
  }

  return {
    getDb: mocks.getDb,
    UserRepository,
    UserSettingsRepository,
  }
})

vi.mock('../../../services/worker-client.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
}))

import { Hono } from 'hono'
import { registerRunNowReminderRoute } from './run-now.js'

const deps = {
  databaseUrl: ':memory:',
  reposRootPath: '/repos',
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

const TEST_USER_ID = 'user-123'
const TEST_DISCORD_USER_ID = 'discord-123'
const TEST_SETTINGS = {
  selectedRepos: '["repo-a","repo-b"]',
  gitAuthor: 'dev@example.com',
  timezone: undefined,
  gitSincePeriod: undefined,
}

function createApp(
  user: Record<string, unknown> | undefined = { id: TEST_USER_ID },
): Hono<{ Variables: { user: Record<string, unknown> } }> {
  const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()

  if (user) {
    app.use('*', async (c, next) => {
      c.set('user', user)
      return next()
    })
  }

  registerRunNowReminderRoute(app, deps)

  return app
}

describe('POST /reminders/run-now', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDb.mockReturnValue({})
    mocks.findSettingsByUserId.mockReturnValue(Result.ok(TEST_SETTINGS))
    mocks.findDiscordIdByUserId.mockReturnValue(Result.ok(TEST_DISCORD_USER_ID))
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 202 when authenticated user is accepted by worker', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ ok: true, accepted: true })
    expect(mocks.triggerStandupJob).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        reposRootPath: deps.reposRootPath,
        selectedRepos: ['repo-a', 'repo-b'],
        gitAuthor: 'dev@example.com',
        timezone: undefined,
        gitSincePeriod: undefined,
      },
    )
  })

  it('returns 401 when session user is missing', async () => {
    const response = await createApp(null as unknown as undefined).fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('returns 400 with actionable message when settings are missing', async () => {
    mocks.findSettingsByUserId.mockReturnValue(Result.ok(null))

    const response = await createApp().fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error:
        'Standup settings not configured. Open settings and save your preferences before running now.',
    })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('returns 400 with actionable message when no repos are configured', async () => {
    mocks.findSettingsByUserId.mockReturnValue(
      Result.ok({
        ...TEST_SETTINGS,
        selectedRepos: '[]',
      }),
    )

    const response = await createApp().fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error:
        'No repositories selected. Open settings and choose at least one repository before running now.',
    })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('returns 400 when Discord identity cannot be resolved', async () => {
    mocks.findDiscordIdByUserId.mockReturnValue(Result.ok(null))

    const response = await createApp().fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error:
        'Discord identity not found. Sign in with Discord again and retry.',
    })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('returns 503 when worker facade cannot accept the request', async () => {
    mocks.triggerStandupJob.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'worker',
          message: 'ECONNREFUSED',
        }),
      ),
    )

    const response = await createApp().fetch(
      new Request('http://localhost/reminders/run-now', {
        method: 'POST',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Worker unavailable' })
  })
})
