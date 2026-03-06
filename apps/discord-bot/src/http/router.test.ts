import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — as rotas delegam para handlers; aqui só testamos o auth middleware
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  notifyStandupReady: vi.fn(),
  notifyJobFailed: vi.fn(),
  sendReminderDm: vi.fn(),
}))

vi.mock('../services/standup-notification-service.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('../services/job-notification-service.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

vi.mock('../discord/notifications/send-reminder-dm.js', () => ({
  sendReminderDm: mocks.sendReminderDm,
}))

import { createInternalRouter } from './router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const fakeClient = {} as unknown as Client

function makeRouter() {
  return createInternalRouter({
    internalSecret: INTERNAL_SECRET,
    databaseUrl: ':memory:',
    client: fakeClient,
    discordUserId: 'user-123',
    discordChannelId: 'channel-456',
    workerInternalUrl: 'http://localhost:3335',
  })
}

function makeRequest(
  path: string,
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-internal-secret'] = secret
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests: auth middleware (aplicado em todas as rotas /internal/*)
// ---------------------------------------------------------------------------

describe('createInternalRouter — GET /health', () => {
  it('retorna 200 com status ok e service discord-bot (sem autenticacao)', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      new Request('http://localhost/health', { method: 'GET' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      service: string
      uptimeSeconds: number
    }
    expect(body.status).toBe('ok')
    expect(body.service).toBe('discord-bot')
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('createInternalRouter — auth middleware', () => {
  let app: ReturnType<typeof createInternalRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = makeRouter()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 401 quando x-internal-secret está ausente em /standup-ready', async () => {
    const res = await app.fetch(
      makeRequest('/internal/notify/standup-ready', { standupId: 'abc' }, null),
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('retorna 401 quando x-internal-secret está incorreto em /standup-ready', async () => {
    const res = await app.fetch(
      makeRequest(
        '/internal/notify/standup-ready',
        { standupId: 'abc' },
        'wrong-secret',
      ),
    )
    expect(res.status).toBe(401)
  })

  it('retorna 401 quando x-internal-secret está ausente em /job-failed', async () => {
    const res = await app.fetch(
      makeRequest(
        '/internal/notify/job-failed',
        { error: 'Something failed' },
        null,
      ),
    )
    expect(res.status).toBe(401)
  })

  it('retorna 401 quando x-internal-secret está incorreto em /job-failed', async () => {
    const res = await app.fetch(
      makeRequest(
        '/internal/notify/job-failed',
        { error: 'Something failed' },
        'bad-secret',
      ),
    )
    expect(res.status).toBe(401)
  })
})
