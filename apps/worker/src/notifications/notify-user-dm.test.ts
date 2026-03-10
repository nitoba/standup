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

import { notifyUserDm } from './notify-user-dm.js'

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

describe('notifyUserDm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('envia POST para /internal/notify/user-dm com os campos corretos (Ok)', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const result = await notifyUserDm({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      discordUserId: 'discord-user-1',
      title: 'Nenhuma atividade encontrada',
      message: 'Não encontrei commits hoje.',
      color: 0xf39c12,
    })

    expect(result.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3334/internal/notify/user-dm')
    expect(init.method).toBe('POST')

    const headers = new Headers(init.headers as HeadersInit)
    expect(headers.get('x-internal-secret')).toBe('my-secret')

    const body = JSON.parse(init.body as string) as {
      discordUserId: string
      title: string
      message: string
      color: number
    }
    expect(body.discordUserId).toBe('discord-user-1')
    expect(body.title).toBe('Nenhuma atividade encontrada')
    expect(body.message).toBe('Não encontrei commits hoje.')
    expect(body.color).toBe(0xf39c12)
  })

  it('funciona sem color opcional', async () => {
    mockFetch.mockResolvedValue(okResponse())

    const result = await notifyUserDm({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      discordUserId: 'discord-user-1',
      title: 'Job em andamento',
      message: 'Seu standup está sendo gerado.',
    })

    expect(result.status).toBe('ok')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { color?: number }
    expect(body.color).toBeUndefined()
  })

  it('retorna ExternalServiceError quando o bot responde com status não-ok (Err)', async () => {
    mockFetch.mockResolvedValue(errorResponse(503))

    const result = await notifyUserDm({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      discordUserId: 'discord-user-1',
      title: 'Teste',
      message: 'Mensagem de teste',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('503')
    }
  })

  it('retorna ExternalServiceError quando fetch lança exceção de rede (Err)', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await notifyUserDm({
      botInternalUrl: 'http://localhost:3334',
      secret: 'my-secret',
      discordUserId: 'discord-user-1',
      title: 'Teste',
      message: 'Mensagem de teste',
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
