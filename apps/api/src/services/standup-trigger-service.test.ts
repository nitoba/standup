import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerStandupJob } from './standup-trigger-service.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as Response
}

describe('triggerStandupJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna Ok quando worker responde 202', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandupJob({
      workerInternalUrl: 'http://localhost:3335',
      internalSecret: 'internal-secret',
    })

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/trigger/standup',
      {
        method: 'POST',
        headers: { 'x-internal-secret': 'internal-secret' },
      },
    )
  })

  it('retorna ExternalServiceError quando worker responde status diferente de 202', async () => {
    mockFetch.mockResolvedValue(response(503))

    const result = await triggerStandupJob({
      workerInternalUrl: 'http://localhost:3335',
      internalSecret: 'internal-secret',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('HTTP 503')
    }
  })

  it('retorna ExternalServiceError quando fetch falha', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await triggerStandupJob({
      workerInternalUrl: 'http://localhost:3335',
      internalSecret: 'internal-secret',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
