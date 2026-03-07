import { describe, expect, it, vi } from 'vitest'
import { sessionAuthMiddleware } from './middleware.js'

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
