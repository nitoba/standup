import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listRepos: vi.fn(),
}))

vi.mock('../../../services/worker-client.js', () => ({
  listRepos: mocks.listRepos,
}))

import { Hono } from 'hono'
import { registerListReposRoute } from './list.js'

const WORKER_INTERNAL_URL = 'http://localhost:3335'
const INTERNAL_SECRET = 'internal-secret'
const TEST_USER_ID = 'user-123'

function makeApp(authenticated = true) {
  const app = new Hono<{ Variables: { user: Record<string, unknown> } }>()

  if (authenticated) {
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
  }

  registerListReposRoute(app, {
    workerInternalUrl: WORKER_INTERNAL_URL,
    internalSecret: INTERNAL_SECRET,
  })

  return app
}

describe('GET /repos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando usuario nao esta autenticado', async () => {
    const app = makeApp(false)

    const res = await app.request('/repos')

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.listRepos).not.toHaveBeenCalled()
  })

  it('retorna payload browser-safe com data quando worker responde com repos', async () => {
    mocks.listRepos.mockResolvedValue(
      Result.ok([
        { id: '1', name: 'repo-a', project: 'AGROTRACE' },
        { id: '2', name: 'repo-b', project: 'CHECKMILK' },
      ]),
    )
    const app = makeApp()

    const res = await app.request('/repos')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [
        { id: '1', name: 'repo-a', project: 'AGROTRACE' },
        { id: '2', name: 'repo-b', project: 'CHECKMILK' },
      ],
    })
    expect(mocks.listRepos).toHaveBeenCalledWith({
      workerInternalUrl: WORKER_INTERNAL_URL,
      internalSecret: INTERNAL_SECRET,
    })
  })

  it('retorna 503 quando worker-facade-service falha', async () => {
    mocks.listRepos.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'worker',
          message: 'HTTP 503',
        }),
      ),
    )
    const app = makeApp()

    const res = await app.request('/repos')

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'Worker unavailable' })
  })
})
