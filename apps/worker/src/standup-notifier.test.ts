import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock global de fetch — notifier usa fetch nativo
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Import após mock
// ---------------------------------------------------------------------------

import { notifyStandupReady } from './standup-notifier.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown = { ok: true }) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
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

describe('notifyStandupReady', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia POST para /internal/notify/standup-ready com secret e standupId (Ok)', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const result = await notifyStandupReady({
      botInternalUrl: 'http://localhost:3334',
      standupId: 'standup-abc',
      secret: 'my-secret',
    })

    expect(result.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3334/internal/notify/standup-ready')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['x-internal-secret']).toBe('my-secret')
    expect(headers['content-type']).toBe('application/json')

    const body = JSON.parse(init.body as string) as { standupId: string }
    expect(body.standupId).toBe('standup-abc')
  })

  it('retorna ExternalServiceError quando o bot responde com status não-ok (Err)', async () => {
    mockFetch.mockResolvedValue(errorResponse(503))

    const result = await notifyStandupReady({
      botInternalUrl: 'http://localhost:3334',
      standupId: 'standup-xyz',
      secret: 'my-secret',
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('discord-bot')
      expect(result.error.message).toContain('503')
    }
  })

  it('retorna ExternalServiceError quando fetch lança exceção de rede (Err)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await notifyStandupReady({
      botInternalUrl: 'http://localhost:3334',
      standupId: 'standup-xyz',
      secret: 'my-secret',
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('discord-bot')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
