import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInternalRouter } from './router.js'

const INTERNAL_SECRET = 'test-secret'

function makeRequest(secret: string | null = INTERNAL_SECRET): Request {
  const headers: Record<string, string> = {}
  if (secret !== null) headers['x-internal-secret'] = secret

  return new Request('http://localhost/internal/trigger/standup', {
    method: 'POST',
    headers,
  })
}

describe('createInternalRouter', () => {
  const triggerStandupJob = vi.fn<() => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    triggerStandupJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando secret está ausente', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest(null))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 401 quando secret está incorreto', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest('wrong-secret'))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 202 e dispara runStandupJob quando secret está correto', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(202)
    const body = (await res.json()) as { ok: boolean; accepted: boolean }
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(true)
    expect(triggerStandupJob).toHaveBeenCalledTimes(1)
  })

  it('retorna 500 quando dispatch do trigger falha antes de iniciar', async () => {
    triggerStandupJob.mockImplementationOnce(() => {
      throw new Error('dispatch failed')
    })

    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(500)
  })
})
