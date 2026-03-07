import { ExternalServiceError, Result } from '@standup/domain'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  sendReminderDm: vi.fn(),
  notifyStandupReady: vi.fn(),
  notifyJobFailed: vi.fn(),
}))

// Necessário pois router.ts importa standup-ready.ts e job-failed.ts que importam @standup/db
vi.mock('../../services/standup-notification-service.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('../../services/job-notification-service.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

vi.mock('../../discord/notifications/send-reminder-dm.js', () => ({
  sendReminderDm: mocks.sendReminderDm,
}))

import { createInternalRouter } from '../router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const WORKER_INTERNAL_URL = 'http://localhost:3335'
const fakeClient = {} as unknown as Client

function makeRouter() {
  return createInternalRouter({
    internalSecret: INTERNAL_SECRET,
    databaseUrl: ':memory:',
    client: fakeClient,
    discordChannelId: 'channel-456',
    workerInternalUrl: WORKER_INTERNAL_URL,
  })
}

function makeRequest(
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-internal-secret'] = secret
  return new Request('http://localhost/internal/notify/standup-reminder', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /internal/notify/standup-reminder', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = makeRouter()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 sem secret', async () => {
    const res = await app.fetch(
      makeRequest(
        { nextRunAt: '2026-03-06T17:30:00.000Z', discordUserId: 'user-123' },
        null,
      ),
    )
    expect(res.status).toBe(401)
  })

  it('retorna 400 quando nextRunAt está ausente', async () => {
    const res = await app.fetch(makeRequest({ discordUserId: 'user-123' }))
    expect(res.status).toBe(400)
    expect(mocks.sendReminderDm).not.toHaveBeenCalled()
  })

  it('retorna 400 quando discordUserId está ausente', async () => {
    const res = await app.fetch(
      makeRequest({ nextRunAt: '2026-03-06T17:30:00.000Z' }),
    )
    expect(res.status).toBe(400)
    expect(mocks.sendReminderDm).not.toHaveBeenCalled()
  })

  it('retorna 200 ok:true quando DM é enviada com sucesso', async () => {
    mocks.sendReminderDm.mockResolvedValue(Result.ok({ messageId: 'msg-789' }))

    const res = await app.fetch(
      makeRequest({
        nextRunAt: '2026-03-06T17:30:00.000Z',
        discordUserId: 'user-123',
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; messageId: string }
    expect(body.ok).toBe(true)
    expect(body.messageId).toBe('msg-789')
    expect(mocks.sendReminderDm).toHaveBeenCalledWith(
      '2026-03-06T17:30:00.000Z',
      {
        client: fakeClient,
        discordUserId: 'user-123',
        workerInternalUrl: WORKER_INTERNAL_URL,
        internalSecret: INTERNAL_SECRET,
      },
    )
  })

  it('retorna 200 ok:false quando DM falha (non-fatal para worker)', async () => {
    mocks.sendReminderDm.mockResolvedValue(
      Result.err(
        new ExternalServiceError({ service: 'discord', message: 'DM blocked' }),
      ),
    )

    const res = await app.fetch(
      makeRequest({
        nextRunAt: '2026-03-06T17:30:00.000Z',
        discordUserId: 'user-123',
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toContain('DM blocked')
  })
})
