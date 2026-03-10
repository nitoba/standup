import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerStandup } from './trigger-standup-service.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/**
 * tracedFetch converts plain header objects to Headers instances and may inject
 * tracing headers (traceparent). This helper extracts the headers from the
 * actual fetch call as a plain key→value map for easy assertion.
 */
function getCalledHeaders(): Record<string, string> {
  const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers
  if (callHeaders instanceof Headers) {
    const result: Record<string, string> = {}
    callHeaders.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  return callHeaders ?? {}
}

function response(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as Response
}

describe('triggerStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna accepted=true quando API responde 202', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandup('test-user-1', 'user-123', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({ accepted: true })
    }

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/standups/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: undefined,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
          replaceStandupId: undefined,
          reuseExistingSource: undefined,
        }),
      }),
    )

    const headers = getCalledHeaders()
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-internal-secret']).toBe('test-secret')
  })

  it('envia extraContext e forceRegenerate quando opcoes fornecidas', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandup(
      'test-user-1',
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      { extraContext: 'focar no card #123', forceRegenerate: true },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/standups/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: 'focar no card #123',
          forceRegenerate: true,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
          replaceStandupId: undefined,
          reuseExistingSource: undefined,
        }),
      }),
    )

    const headers = getCalledHeaders()
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-internal-secret']).toBe('test-secret')
  })

  it('envia rewriteFromStandupId e rewriteInstruction para ajuste baseado no texto anterior', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandup(
      'test-user-1',
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover item X e adicionar item Y',
      },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/standups/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: true,
          rewriteFromStandupId: 'standup-abc',
          rewriteInstruction: 'Remover item X e adicionar item Y',
          replaceStandupId: undefined,
          reuseExistingSource: undefined,
        }),
      }),
    )

    const headers = getCalledHeaders()
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-internal-secret']).toBe('test-secret')
  })

  it('envia replaceStandupId para preservar o mesmo registro', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandup(
      'test-user-1',
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
      },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/standups/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: true,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
          replaceStandupId: 'standup-abc',
          reuseExistingSource: undefined,
        }),
      }),
    )

    const headers = getCalledHeaders()
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-internal-secret']).toBe('test-secret')
  })

  it('envia reuseExistingSource quando solicitado', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandup(
      'test-user-1',
      'user-123',
      { apiBaseUrl: 'http://localhost:3333', internalSecret: 'test-secret' },
      {
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
        reuseExistingSource: true,
      },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3333/standups/trigger',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: true,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
          replaceStandupId: 'standup-abc',
          reuseExistingSource: true,
        }),
      }),
    )

    const headers = getCalledHeaders()
    expect(headers['content-type']).toBe('application/json')
    expect(headers['x-internal-secret']).toBe('test-secret')
  })

  it('retorna conflito tipado quando API responde 409', async () => {
    mockFetch.mockResolvedValue({
      ...response(409),
      json: async () => ({
        ok: false,
        accepted: false,
        reason: 'pending_review_exists',
        standupId: 'standup-abc',
      }),
    } as Response)

    const result = await triggerStandup('test-user-1', 'user-123', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        accepted: false,
        reason: 'pending_review_exists',
        standupId: 'standup-abc',
      })
    }
  })

  it('retorna forbidden quando API responde 403', async () => {
    mockFetch.mockResolvedValue(response(403))

    const result = await triggerStandup('test-user-1', 'user-123', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({ accepted: false, reason: 'forbidden' })
    }
  })

  it('retorna ExternalServiceError quando API responde erro inesperado', async () => {
    mockFetch.mockResolvedValue(response(500))

    const result = await triggerStandup('test-user-1', 'user-123', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('api')
      expect(result.error.message).toContain('HTTP 500')
    }
  })

  it('retorna ExternalServiceError quando fetch falha', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    const result = await triggerStandup('test-user-1', 'user-123', {
      apiBaseUrl: 'http://localhost:3333',
      internalSecret: 'test-secret',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('api')
      expect(result.error.message).toContain('network down')
    }
  })
})
