import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  snoozeReminder: vi.fn(),
}))

vi.mock('../../../services/worker-client.js', () => ({
  snoozeReminder: mocks.snoozeReminder,
}))

import { Hono } from 'hono'
import { registerSnoozeReminderRoute } from './snooze.js'

const deps = {
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

function makeRequest(): Request {
  return new Request('http://localhost/reminders/snooze', {
    method: 'POST',
  })
}

describe('POST /reminders/snooze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando usuario autenticado nao existe', async () => {
    const app = new Hono()
    registerSnoozeReminderRoute(app, deps)

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.snoozeReminder).not.toHaveBeenCalled()
  })

  it('retorna ack do worker em data para usuario autenticado', async () => {
    mocks.snoozeReminder.mockResolvedValue(
      Result.ok({
        ok: true,
        snoozedUntil: '2026-03-09T18:00:00.000Z',
      }),
    )

    const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-123' })
      return next()
    })
    registerSnoozeReminderRoute(app, deps)

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        ok: true,
        snoozedUntil: '2026-03-09T18:00:00.000Z',
      },
    })
    expect(mocks.snoozeReminder).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: 'user-123',
      },
    )
  })

  it('retorna 503 quando worker facade falha', async () => {
    mocks.snoozeReminder.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'worker',
          message: 'ECONNREFUSED',
        }),
      ),
    )

    const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-123' })
      return next()
    })
    registerSnoozeReminderRoute(app, deps)

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Worker unavailable' })
  })
})
