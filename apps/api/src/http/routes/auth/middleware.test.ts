import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { sessionAuthMiddleware } from './middleware.js'

const INTERNAL_SECRET = 'secret-123'
const TEST_USER_ID = 'user-123'

function makeContext(headers: Record<string, string> = {}) {
  const set = vi.fn()
  const json = vi.fn((body: unknown, status: number) => ({ body, status }))

  return {
    c: {
      req: {
        header: (name: string) => new Headers(headers).get(name) ?? undefined,
        raw: {
          headers: new Headers(headers),
        },
      },
      json,
      set,
    },
    json,
    set,
  }
}

describe('sessionAuthMiddleware', () => {
  it('allows internal calls only when x-internal-secret matches', async () => {
    const getSession = vi.fn()
    const next = vi.fn().mockResolvedValue(undefined)
    const { c, set } = makeContext({ 'x-internal-secret': 'secret-123' })

    const middleware = sessionAuthMiddleware(
      {
        api: { getSession },
      } as never,
      'secret-123',
    )

    await middleware(c as never, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(getSession).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('does not bypass session auth when x-internal-secret is incorrect', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const next = vi.fn().mockResolvedValue(undefined)
    const { c, json, set } = makeContext({
      'x-internal-secret': 'wrong-secret',
    })

    const middleware = sessionAuthMiddleware(
      {
        api: { getSession },
      } as never,
      'secret-123',
    )

    const response = await middleware(c as never, next)

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
    expect(response).toEqual({ body: { error: 'Unauthorized' }, status: 401 })
    expect(next).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('rejects requests without a session', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const next = vi.fn().mockResolvedValue(undefined)
    const { c, json, set } = makeContext()

    const middleware = sessionAuthMiddleware(
      {
        api: { getSession },
      } as never,
      'secret-123',
    )

    const response = await middleware(c as never, next)

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401)
    expect(response).toEqual({ body: { error: 'Unauthorized' }, status: 401 })
    expect(next).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('stores session data and continues when session is valid', async () => {
    const session = {
      user: { id: 'user-1' },
      session: { id: 'session-1' },
    }
    const getSession = vi.fn().mockResolvedValue(session)
    const next = vi.fn().mockResolvedValue(undefined)
    const { c, set } = makeContext()

    const middleware = sessionAuthMiddleware(
      {
        api: { getSession },
      } as never,
      'secret-123',
    )

    await middleware(c as never, next)

    expect(set).toHaveBeenNthCalledWith(1, 'user', session.user)
    expect(set).toHaveBeenNthCalledWith(2, 'session', session.session)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

function createApp(getSession = vi.fn().mockResolvedValue(null)) {
  const app = new Hono<{
    Variables: {
      user: Record<string, unknown>
      session: Record<string, unknown>
    }
  }>()
  const middleware = sessionAuthMiddleware(
    {
      api: { getSession },
    } as never,
    INTERNAL_SECRET,
  )

  app.get('/health', (c) => c.json({ status: 'ok', service: 'standup-api' }))
  app.get('/ready', (c) => c.json({ status: 'ready' }))
  app.on(['GET', 'POST'], '/api/auth/*', (c) =>
    c.json({ authPath: c.req.path, method: c.req.method }),
  )
  app.get('/auth/callback', (c) => c.json({ callback: true }))
  app.get('/auth/login/discord', (c) => c.json({ redirect: 'discord' }))

  app.use('/standups/*', middleware)
  app.use('/settings/*', middleware)
  app.use('/repos', middleware)
  app.use('/reminders/*', middleware)

  app.get('/settings/me', (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return c.json({ userId: user.id })
  })

  app.get('/repos', (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return c.json({ userId: user.id })
  })

  app.post('/reminders/run-now', (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return c.json({ userId: user.id }, 202)
  })

  app.post('/reminders/snooze', (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return c.json({ userId: user.id })
  })

  app.post('/reminders/cancel-today', (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id !== 'string') {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return c.json({ userId: user.id })
  })

  app.post('/standups/trigger', async (c) => {
    const user = c.get('user') as Record<string, unknown> | undefined
    if (typeof user?.id === 'string') {
      return c.json({ accepted: true, userId: user.id }, 202)
    }

    const body = (await c.req.json().catch(() => null)) as {
      userId?: unknown
      discordUserId?: unknown
    } | null

    if (
      typeof body?.userId !== 'string' ||
      typeof body?.discordUserId !== 'string'
    ) {
      return c.json({ error: 'Could not resolve userId or discordUserId' }, 400)
    }

    return c.json(
      {
        accepted: true,
        userId: body.userId,
        discordUserId: body.discordUserId,
      },
      202,
    )
  })

  return { app, getSession }
}

describe('sessionAuthMiddleware route contract', () => {
  it('keeps public auth and health routes accessible without a session', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const { app } = createApp(getSession)

    const responses = await Promise.all([
      app.request('/health'),
      app.request('/ready'),
      app.request('/api/auth/sign-in/discord'),
      app.request('/api/auth/sign-in/discord', { method: 'POST' }),
      app.request('/auth/callback'),
      app.request('/auth/login/discord'),
    ])

    expect(responses[0].status).toBe(200)
    expect(await responses[0].json()).toEqual({
      status: 'ok',
      service: 'standup-api',
    })
    expect(responses[1].status).toBe(200)
    expect(await responses[1].json()).toEqual({ status: 'ready' })
    expect(responses[2].status).toBe(200)
    expect(await responses[2].json()).toEqual({
      authPath: '/api/auth/sign-in/discord',
      method: 'GET',
    })
    expect(responses[3].status).toBe(200)
    expect(await responses[3].json()).toEqual({
      authPath: '/api/auth/sign-in/discord',
      method: 'POST',
    })
    expect(responses[4].status).toBe(200)
    expect(await responses[4].json()).toEqual({ callback: true })
    expect(responses[5].status).toBe(200)
    expect(await responses[5].json()).toEqual({ redirect: 'discord' })
    expect(getSession).not.toHaveBeenCalled()
  })

  it('returns 401 for protected routes when there is no authenticated session', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const { app } = createApp(getSession)

    const responses = await Promise.all([
      app.request('/settings/me'),
      app.request('/repos'),
      app.request('/reminders/run-now', { method: 'POST' }),
      app.request('/reminders/snooze', { method: 'POST' }),
      app.request('/reminders/cancel-today', { method: 'POST' }),
    ])

    for (const response of responses) {
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    }

    expect(getSession).toHaveBeenCalledTimes(5)
  })

  it('does not bypass session auth when x-internal-secret is incorrect', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const { app } = createApp(getSession)

    const response = await app.request('/repos', {
      headers: { 'x-internal-secret': 'wrong-secret' },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(getSession).toHaveBeenCalledTimes(1)
  })

  it('limits internal-secret bypass to the intended service-to-service trigger route', async () => {
    const getSession = vi.fn().mockResolvedValue(null)
    const { app } = createApp(getSession)

    const triggerResponse = await app.request('/standups/trigger', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        discordUserId: 'discord-user-123',
      }),
    })
    const settingsResponse = await app.request('/settings/me', {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })
    const reposResponse = await app.request('/repos', {
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })
    const runNowResponse = await app.request('/reminders/run-now', {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })
    const snoozeResponse = await app.request('/reminders/snooze', {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })
    const cancelTodayResponse = await app.request('/reminders/cancel-today', {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    })

    expect(triggerResponse.status).toBe(202)
    expect(await triggerResponse.json()).toEqual({
      accepted: true,
      userId: TEST_USER_ID,
      discordUserId: 'discord-user-123',
    })

    for (const response of [
      settingsResponse,
      reposResponse,
      runNowResponse,
      snoozeResponse,
      cancelTodayResponse,
    ]) {
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    }

    expect(getSession).not.toHaveBeenCalled()
  })
})
