import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  snoozeReminder: vi.fn(),
}))

vi.mock('../services/worker-facade-service.js', () => ({
  snoozeReminder: mocks.snoozeReminder,
}))

import { Hono } from 'hono'
import { handleSnoozeReminder } from './snooze.js'

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
    app.post('/reminders/snooze', (c) => handleSnoozeReminder(c, deps))

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
    app.post('/reminders/snooze', (c) => handleSnoozeReminder(c, deps))

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
    app.post('/reminders/snooze', (c) => handleSnoozeReminder(c, deps))

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Worker unavailable' })
  })
})
