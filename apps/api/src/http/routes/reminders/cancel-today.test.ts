import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancelReminderForToday: vi.fn(),
}))

vi.mock('../../../services/worker-facade-service.js', () => ({
  cancelReminderForToday: mocks.cancelReminderForToday,
}))

import { Hono } from 'hono'
import { registerCancelTodayReminderRoute } from './cancel-today.js'

const TEST_USER_ID = 'test-user-1'
const deps = {
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

function makePostRequest(): Request {
  return new Request('http://localhost/reminders/cancel-today', {
    method: 'POST',
  })
}

describe('POST /reminders/cancel-today', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 200 quando worker cancela o lembrete do dia', async () => {
    mocks.cancelReminderForToday.mockResolvedValue(
      Result.ok({ ok: true, cancelledDate: '2026-03-09' }),
    )

    const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    registerCancelTodayReminderRoute(app, deps)

    const res = await app.fetch(makePostRequest())

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { ok: boolean; cancelledDate: string }
    }
    expect(body.data).toEqual({ ok: true, cancelledDate: '2026-03-09' })
    expect(mocks.cancelReminderForToday).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      { userId: TEST_USER_ID },
    )
  })

  it('retorna 503 quando o worker facade falha', async () => {
    mocks.cancelReminderForToday.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'worker',
          message: 'ECONNREFUSED',
        }),
      ),
    )

    const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    registerCancelTodayReminderRoute(app, deps)

    const res = await app.fetch(makePostRequest())

    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Worker unavailable')
  })

  it('retorna 401 quando a requisição não está autenticada', async () => {
    const app = new Hono()
    registerCancelTodayReminderRoute(app, deps)

    const res = await app.fetch(makePostRequest())

    expect(res.status).toBe(401)
    expect(mocks.cancelReminderForToday).not.toHaveBeenCalled()
  })
})
