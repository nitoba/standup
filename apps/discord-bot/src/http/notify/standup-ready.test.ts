import { DbError, NotFoundError, Result } from '@standup/domain'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  notifyStandupReady: vi.fn(),
  sendReminderDm: vi.fn(),
}))

vi.mock('../../services/standup-notification-service.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

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
  return new Request('http://localhost/internal/notify/standup-ready', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /internal/notify/standup-ready', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: DATABASE_URL,
      client: fakeClient,
      discordChannelId: DISCORD_CHANNEL_ID,
      workerInternalUrl: 'http://localhost:3335',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 400 quando standupId está ausente', async () => {
    const res = await app.fetch(makeRequest({ discordUserId: DISCORD_USER_ID }))

    expect(res.status).toBe(400)
    const body = (await res.json()) as { success: boolean; error: unknown[] }
    expect(body.success).toBe(false)
    expect(Array.isArray(body.error)).toBe(true)
    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
  })

  it('retorna 400 quando standupId é string vazia', async () => {
    const res = await app.fetch(
      makeRequest({ standupId: '', discordUserId: DISCORD_USER_ID }),
    )

    expect(res.status).toBe(400)
    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
  })

  it('retorna 404 quando standup não existe', async () => {
    mocks.notifyStandupReady.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-abc' })),
    )

    const res = await app.fetch(
      makeRequest({ standupId: 'standup-abc', discordUserId: DISCORD_USER_ID }),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 500 quando DbError', async () => {
    mocks.notifyStandupReady.mockResolvedValue(
      Result.err(new DbError({ operation: 'findById', message: 'disk full' })),
    )

    const res = await app.fetch(
      makeRequest({ standupId: 'standup-abc', discordUserId: DISCORD_USER_ID }),
    )

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })

  it('retorna 200 e chama o service com os deps corretos', async () => {
    mocks.notifyStandupReady.mockResolvedValue(
      Result.ok({ standupId: 'standup-abc', dmSent: true, transitioned: true }),
    )

    const res = await app.fetch(
      makeRequest({ standupId: 'standup-abc', discordUserId: DISCORD_USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; standupId: string }
    expect(body.ok).toBe(true)
    expect(body.standupId).toBe('standup-abc')
    expect(mocks.notifyStandupReady).toHaveBeenCalledWith('standup-abc', {
      databaseUrl: DATABASE_URL,
      client: fakeClient,
      discordUserId: DISCORD_USER_ID,
    })
  })

  it('retorna 200 mesmo quando DM falha (non-fatal — resultado do service)', async () => {
    mocks.notifyStandupReady.mockResolvedValue(
      Result.ok({
        standupId: 'standup-abc',
        dmSent: false,
        transitioned: false,
      }),
    )

    const res = await app.fetch(
      makeRequest({ standupId: 'standup-abc', discordUserId: DISCORD_USER_ID }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
