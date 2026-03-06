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

import { notifyStandupReminder } from './notify-standup-reminder.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse() {
  return { ok: true, status: 200 } as Response
}

function errorResponse(status: number) {
  return { ok: false, status } as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('notifyStandupReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia POST para /internal/notify/standup-reminder com secret e nextRunAt (Ok)', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const nextRunAt = '2026-03-06T17:30:00.000Z'
    const result = await notifyStandupReminder({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      nextRunAt,
    })

    expect(result.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3334/internal/notify/standup-reminder')
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['x-internal-secret']).toBe('my-secret')
    expect(headers['content-type']).toBe('application/json')

    const body = JSON.parse(init.body as string) as { nextRunAt: string }
    expect(body.nextRunAt).toBe(nextRunAt)
  })

  it('retorna ExternalServiceError quando o bot responde com status não-ok (Err)', async () => {
    mockFetch.mockResolvedValue(errorResponse(503))

    const result = await notifyStandupReminder({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      nextRunAt: '2026-03-06T17:30:00.000Z',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('discord-bot')
      expect(result.error.message).toContain('503')
    }
  })

  it('retorna ExternalServiceError quando fetch lança exceção de rede (Err)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await notifyStandupReminder({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      nextRunAt: '2026-03-06T17:30:00.000Z',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('discord-bot')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
