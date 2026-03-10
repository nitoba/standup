import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock global de fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import após mock
// ---------------------------------------------------------------------------

import { notifyJobFailed } from './notify-job-failed.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown = { ok: true }) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'upstream error' }),
  } as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifyJobFailed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia POST para /internal/notify/job-failed com error e context (Ok)', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const result = await notifyJobFailed({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      error: 'LLM timeout after 30s',
      context: 'standup-job',
    })

    expect(result.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3334/internal/notify/job-failed')
    expect(init.method).toBe('POST')

    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('x-internal-secret')).toBe('my-secret')

    const body = JSON.parse(init.body as string) as {
      error: string
      context: string
    }
    expect(body.error).toBe('LLM timeout after 30s')
    expect(body.context).toBe('standup-job')
  })

  it('funciona sem context opcional', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const result = await notifyJobFailed({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      error: 'Something failed',
    })

    expect(result.status).toBe('ok')
  })

  it('inclui discordUserId no payload quando fornecido', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await notifyJobFailed({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      error: 'Pipeline error',
      context: 'standup-job',
      discordUserId: 'discord-user-1',
    })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      error: string
      context: string
      discordUserId: string
    }
    expect(body.discordUserId).toBe('discord-user-1')
  })

  it('retorna ExternalServiceError quando o bot responde com status não-ok (Err)', async () => {
    mockFetch.mockResolvedValue(errorResponse(503))

    const result = await notifyJobFailed({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      error: 'Git clone failed',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('503')
    }
  })

  it('retorna ExternalServiceError quando fetch lança exceção de rede (Err)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await notifyJobFailed({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      error: 'Git clone failed',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
