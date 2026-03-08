import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRemoteServiceHealth } from './service-health-check.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('checkRemoteServiceHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna ok=true quando /health responde 200 com status ok', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, { status: 'ok', uptimeSeconds: 123 }),
    )

    const result = await checkRemoteServiceHealth(
      'api',
      'http://localhost:3333',
    )

    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.uptimeSeconds).toBe(123)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('retorna ok=false quando status HTTP não é 2xx', async () => {
    mockFetch.mockResolvedValue(makeResponse(503, { status: 'error' }))

    const result = await checkRemoteServiceHealth(
      'worker',
      'http://localhost:3335',
    )

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(503)
    expect(result.error).toContain('HTTP 503')
  })

  it('retorna ok=false quando payload não contém status ok', async () => {
    mockFetch.mockResolvedValue(makeResponse(200, { status: 'degraded' }))

    const result = await checkRemoteServiceHealth(
      'api',
      'http://localhost:3333',
    )

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(200)
    expect(result.error).toContain('Invalid health response')
  })

  it('retorna ok=false quando fetch falha', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    const result = await checkRemoteServiceHealth(
      'worker',
      'http://localhost:3335',
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('network down')
  })
})
