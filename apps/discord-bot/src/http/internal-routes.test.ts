import { NotFoundError, Result } from '@standup/domain'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — inicialização antes do hoist de vi.mock
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  repoFindById: vi.fn(),
  repoUpdateStatus: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  sendReviewDm: vi.fn(),
  sendChannelNotification: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks de módulos
// ---------------------------------------------------------------------------

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return {
      findById: mocks.repoFindById,
      updateStatus: mocks.repoUpdateStatus,
    }
  }
  return { getDb: mocks.getDb, StandupRepository }
})

vi.mock('../discord/send-review-dm.js', () => ({
  sendReviewDm: mocks.sendReviewDm,
}))

vi.mock('../discord/send-channel-notification.js', () => ({
  sendChannelNotification: mocks.sendChannelNotification,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import { createInternalRouter } from './internal-routes.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const DATABASE_URL = ':memory:'
const DISCORD_USER_ID = 'user-123'
const DISCORD_CHANNEL_ID = 'channel-456'

// fake client — apenas para satisfazer o tipo; módulos Discord são mockados
const fakeClient = {} as unknown as Client

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: '',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  status: 'draft' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  url: string,
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (secret !== null) {
    headers['x-internal-secret'] = secret
  }
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function makeStandupReadyRequest(
  body: unknown,
  secret?: string | null,
): Request {
  return makeRequest('/internal/notify/standup-ready', body, secret)
}

function makeJobFailedRequest(body: unknown, secret?: string | null): Request {
  return makeRequest('/internal/notify/job-failed', body, secret)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createInternalRouter', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: DATABASE_URL,
      client: fakeClient,
      discordUserId: DISCORD_USER_ID,
      discordChannelId: DISCORD_CHANNEL_ID,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Auth middleware
  // -------------------------------------------------------------------------

  it('retorna 401 quando x-internal-secret está ausente', async () => {
    const req = makeStandupReadyRequest({ standupId: 'standup-abc' }, null)
    const res = await app.fetch(req)

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('retorna 401 quando x-internal-secret está incorreto', async () => {
    const req = makeStandupReadyRequest(
      { standupId: 'standup-abc' },
      'wrong-secret',
    )
    const res = await app.fetch(req)

    expect(res.status).toBe(401)
  })

  // -------------------------------------------------------------------------
  // POST /internal/notify/standup-ready
  // -------------------------------------------------------------------------

  describe('POST /internal/notify/standup-ready', () => {
    it('retorna 400 quando standupId está ausente no body', async () => {
      const req = makeStandupReadyRequest({})
      const res = await app.fetch(req)

      expect(res.status).toBe(400)
      const body = (await res.json()) as { success: boolean; error: unknown[] }
      expect(body.success).toBe(false)
      expect(Array.isArray(body.error)).toBe(true)
      expect(body.error.length).toBeGreaterThan(0)
    })

    it('retorna 400 quando standupId é string vazia', async () => {
      const req = makeStandupReadyRequest({ standupId: '' })
      const res = await app.fetch(req)

      expect(res.status).toBe(400)
      const body = (await res.json()) as { success: boolean; error: unknown[] }
      expect(body.success).toBe(false)
      expect(Array.isArray(body.error)).toBe(true)
      expect(body.error.length).toBeGreaterThan(0)
    })

    it('retorna 404 quando standup não existe no banco', async () => {
      mocks.repoFindById.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
        ),
      )

      const req = makeStandupReadyRequest({ standupId: 'standup-abc' })
      const res = await app.fetch(req)

      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toMatch(/not found/i)
    })

    it('retorna 200, envia DM e transiciona para pending_review quando tudo está correto', async () => {
      mocks.repoFindById.mockResolvedValue(Result.ok(standupRecord))
      mocks.sendReviewDm.mockResolvedValue(Result.ok({ messageId: 'msg-999' }))
      mocks.repoUpdateStatus.mockResolvedValue(
        Result.ok({ ...standupRecord, status: 'pending_review' }),
      )

      const req = makeStandupReadyRequest({ standupId: 'standup-abc' })
      const res = await app.fetch(req)

      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; standupId: string }
      expect(body.ok).toBe(true)
      expect(body.standupId).toBe('standup-abc')
      expect(mocks.repoFindById).toHaveBeenCalledWith('standup-abc')
      expect(mocks.sendReviewDm).toHaveBeenCalledWith(standupRecord, {
        client: fakeClient,
        discordUserId: DISCORD_USER_ID,
      })
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'pending_review',
      )
    })

    it('retorna 200 mas NÃO transiciona quando envio de DM falha (non-fatal)', async () => {
      mocks.repoFindById.mockResolvedValue(Result.ok(standupRecord))
      mocks.sendReviewDm.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'discord-user', id: 'unknown' }),
        ),
      )

      const req = makeStandupReadyRequest({ standupId: 'standup-abc' })
      const res = await app.fetch(req)

      expect(res.status).toBe(200)
      expect(mocks.repoFindById).toHaveBeenCalledOnce()
      expect(mocks.sendReviewDm).toHaveBeenCalledOnce()
      expect(mocks.repoUpdateStatus).not.toHaveBeenCalled()
    })

    it('retorna 200 mesmo quando transição para pending_review falha (non-fatal)', async () => {
      mocks.repoFindById.mockResolvedValue(Result.ok(standupRecord))
      mocks.sendReviewDm.mockResolvedValue(Result.ok({ messageId: 'msg-999' }))
      mocks.repoUpdateStatus.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
        ),
      )

      const req = makeStandupReadyRequest({ standupId: 'standup-abc' })
      const res = await app.fetch(req)

      expect(res.status).toBe(200)
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'pending_review',
      )
    })
  })

  // -------------------------------------------------------------------------
  // POST /internal/notify/job-failed (Padrão 8 do Akita)
  // -------------------------------------------------------------------------

  describe('POST /internal/notify/job-failed', () => {
    it('retorna 400 quando error está ausente no body', async () => {
      const req = makeJobFailedRequest({})
      const res = await app.fetch(req)

      expect(res.status).toBe(400)
      const body = (await res.json()) as { success: boolean; error: unknown[] }
      expect(body.success).toBe(false)
    })

    it('retorna 200 e envia embed vermelho no canal quando job falha', async () => {
      mocks.sendChannelNotification.mockResolvedValue(Result.ok(undefined))

      const req = makeJobFailedRequest({
        error: 'LLM timeout after 30s',
        context: 'standup-job',
      })
      const res = await app.fetch(req)

      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean }
      expect(body.ok).toBe(true)

      expect(mocks.sendChannelNotification).toHaveBeenCalledOnce()
      const [calledClient, calledChannelId, calledEmbed] = mocks
        .sendChannelNotification.mock.calls[0] as [
        Client,
        string,
        { title: string; color: number },
      ]
      expect(calledClient).toBe(fakeClient)
      expect(calledChannelId).toBe(DISCORD_CHANNEL_ID)
      // Embed vermelho para falha
      expect(calledEmbed.color).toBe(0xe74c3c)
      expect(calledEmbed.title).toContain('Falhou')
    })

    it('retorna 200 com ok:false quando envio ao canal falha (non-fatal para worker)', async () => {
      mocks.sendChannelNotification.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'discord-channel', id: 'channel-456' }),
        ),
      )

      const req = makeJobFailedRequest({ error: 'DB connection failed' })
      const res = await app.fetch(req)

      // Non-fatal: worker não deve re-tentar por causa de falha do Discord
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; reason: string }
      expect(body.ok).toBe(false)
      expect(body.reason).toMatch(/channel notification failed/)
    })

    it('funciona sem context opcional', async () => {
      mocks.sendChannelNotification.mockResolvedValue(Result.ok(undefined))

      const req = makeJobFailedRequest({ error: 'Something went wrong' })
      const res = await app.fetch(req)

      expect(res.status).toBe(200)
      expect(mocks.sendChannelNotification).toHaveBeenCalledOnce()
    })
  })
})
