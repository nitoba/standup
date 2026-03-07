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

  it('retorna Ok quando worker responde 202 (sem opcoes extras)', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandupJob(
      {
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: 'internal-secret',
      },
      { userId: 'test-user-1', discordUserId: 'test-discord-1' },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/trigger/standup',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'test-discord-1',
          extraContext: undefined,
          forceRegenerate: undefined,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
        }),
      },
    )
  })

  it('envia body com extraContext e forceRegenerate quando opcoes presentes', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandupJob(
      {
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: 'internal-secret',
      },
      {
        userId: 'test-user-1',
        discordUserId: 'test-discord-1',
        extraContext: 'focar no card #123',
        forceRegenerate: true,
      },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/trigger/standup',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'test-discord-1',
          extraContext: 'focar no card #123',
          forceRegenerate: true,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
        }),
      },
    )
  })

  it('envia opcoes de rewrite para o worker quando fornecidas', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await triggerStandupJob(
      {
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: 'internal-secret',
      },
      {
        userId: 'test-user-1',
        discordUserId: 'test-discord-1',
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Ajustar para remover seção antiga',
      },
    )

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/trigger/standup',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test-user-1',
          discordUserId: 'test-discord-1',
          extraContext: undefined,
          forceRegenerate: true,
          rewriteFromStandupId: 'standup-abc',
          rewriteInstruction: 'Ajustar para remover seção antiga',
        }),
      },
    )
  })

  it('retorna ExternalServiceError quando worker responde status diferente de 202', async () => {
    mockFetch.mockResolvedValue(response(503))

    const result = await triggerStandupJob(
      {
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: 'internal-secret',
      },
      { userId: 'test-user-1', discordUserId: 'test-discord-1' },
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('HTTP 503')
    }
  })

  it('retorna ExternalServiceError quando fetch falha', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await triggerStandupJob(
      {
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: 'internal-secret',
      },
      { userId: 'test-user-1', discordUserId: 'test-discord-1' },
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
