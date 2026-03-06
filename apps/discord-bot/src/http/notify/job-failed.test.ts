import { Result } from '@standup/domain'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  notifyJobFailed: vi.fn(),
  notifyStandupReady: vi.fn(),
  sendReminderDm: vi.fn(),
}))

// Necessário pois router.ts importa standup-ready.ts que importa @standup/db (bun:sqlite)
vi.mock('../../services/standup-notification-service.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('../../services/job-notification-service.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

// Necessário pois router.ts importa standup-reminder.ts que importa send-reminder-dm.ts
vi.mock('../../discord/notifications/send-reminder-dm.js', () => ({
  sendReminderDm: mocks.sendReminderDm,
}))

import { createInternalRouter } from '../router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const DATABASE_URL = ':memory:'
const DISCORD_USER_ID = 'user-123'
const DISCORD_CHANNEL_ID = 'channel-456'
const fakeClient = {} as unknown as Client

function makeRequest(
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-internal-secret'] = secret
  return new Request('http://localhost/internal/notify/job-failed', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /internal/notify/job-failed', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: DATABASE_URL,
      client: fakeClient,
      discordUserId: DISCORD_USER_ID,
      discordChannelId: DISCORD_CHANNEL_ID,
      workerInternalUrl: 'http://localhost:3335',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 400 quando error está ausente', async () => {
    const res = await app.fetch(makeRequest({}))

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean; error: unknown[] }
    expect(body.success).toBe(false)
    expect(mocks.notifyJobFailed).not.toHaveBeenCalled()
  })

  it('retorna 200 com ok:true quando notificação enviada com sucesso', async () => {
    mocks.notifyJobFailed.mockResolvedValue(Result.ok({ notified: true }))

    const res = await app.fetch(
      makeRequest({ error: 'LLM timeout after 30s', context: 'standup-job' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mocks.notifyJobFailed).toHaveBeenCalledWith(
      'LLM timeout after 30s',
      'standup-job',
      { client: fakeClient, discordChannelId: DISCORD_CHANNEL_ID },
    )
  })

  it('retorna 200 com ok:false quando canal falha (non-fatal para worker)', async () => {
    mocks.notifyJobFailed.mockResolvedValue(
      Result.ok({ notified: false, reason: 'channel notification failed' }),
    )

    const res = await app.fetch(makeRequest({ error: 'DB connection failed' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toMatch(/channel notification failed/)
  })

  it('funciona sem context opcional', async () => {
    mocks.notifyJobFailed.mockResolvedValue(Result.ok({ notified: true }))

    const res = await app.fetch(makeRequest({ error: 'Something went wrong' }))

    expect(res.status).toBe(200)
    expect(mocks.notifyJobFailed).toHaveBeenCalledWith(
      'Something went wrong',
      undefined,
      expect.objectContaining({ discordChannelId: DISCORD_CHANNEL_ID }),
    )
  })
})
