import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInternalRouter } from './router.js'
import type { StandupJobOptions } from './trigger/standup.js'

const INTERNAL_SECRET = 'test-secret'

function makeRequest(
  secret: string | null = INTERNAL_SECRET,
  body?: Record<string, unknown>,
): Request {
  const headers: Record<string, string> = {}
  if (secret !== null) headers['x-internal-secret'] = secret
  if (body) headers['content-type'] = 'application/json'

  return new Request('http://localhost/internal/trigger/standup', {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('createInternalRouter', () => {
  const triggerStandupJob =
    vi.fn<(options?: StandupJobOptions) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    triggerStandupJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando secret esta ausente', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest(null))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 401 quando secret esta incorreto', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest('wrong-secret'))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 202 e dispara runStandupJob quando secret esta correto', async () => {
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

  it('passa extraContext e forceRegenerate ao triggerStandupJob quando body presente', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(
      makeRequest(INTERNAL_SECRET, {
        extraContext: 'focar mais no card #123',
        forceRegenerate: true,
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      extraContext: 'focar mais no card #123',
      forceRegenerate: true,
    })
  })

  it('funciona sem body (backwards-compatible)', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
    })

    const res = await app.fetch(makeRequest())

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith(undefined)
  })
})
