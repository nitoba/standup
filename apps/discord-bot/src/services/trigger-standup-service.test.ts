import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerStandup } from './trigger-standup-service.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

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
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': 'test-secret',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: undefined,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
        }),
      },
    )
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
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': 'test-secret',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: 'focar no card #123',
          forceRegenerate: true,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
        }),
      },
    )
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
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': 'test-secret',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'user-123',
          extraContext: undefined,
          forceRegenerate: true,
          rewriteFromStandupId: 'standup-abc',
          rewriteInstruction: 'Remover item X e adicionar item Y',
        }),
      },
    )
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
