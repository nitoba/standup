import { Result } from '@standup/domain'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  sendUserDm: vi.fn(),
  notifyStandupReady: vi.fn(),
  notifyJobFailed: vi.fn(),
  sendReminderDm: vi.fn(),
}))

// Necessário pois router.ts importa handlers transitivamente que importam @standup/db
vi.mock('../../services/standup-notification-service.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('../../services/job-notification-service.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

vi.mock('../../discord/notifications/send-user-dm.js', () => ({
  sendUserDm: mocks.sendUserDm,
}))

// Necessário pois router.ts importa standup-reminder.ts
vi.mock('../../discord/notifications/send-reminder-dm.js', () => ({
  sendReminderDm: mocks.sendReminderDm,
}))

import { createInternalRouter } from '../router.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = 'test-secret'
const DATABASE_URL = ':memory:'
const DISCORD_CHANNEL_ID = 'channel-456'
const fakeClient = {} as unknown as Client

function makeRequest(
  body: unknown,
  secret: string | null = INTERNAL_SECRET,
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-internal-secret'] = secret
  return new Request('http://localhost/internal/notify/user-dm', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /internal/notify/user-dm', () => {
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

  it('retorna 401 sem secret', async () => {
    const res = await app.fetch(
      makeRequest(
        { discordUserId: 'u1', title: 'Título', message: 'Mensagem' },
        null,
      ),
    )
    expect(res.status).toBe(401)
    expect(mocks.sendUserDm).not.toHaveBeenCalled()
  })

  it('retorna 400 quando discordUserId está ausente', async () => {
    const res = await app.fetch(
      makeRequest({ title: 'Título', message: 'Mensagem' }),
    )
    expect(res.status).toBe(400)
    expect(mocks.sendUserDm).not.toHaveBeenCalled()
  })

  it('retorna 400 quando title está ausente', async () => {
    const res = await app.fetch(
      makeRequest({ discordUserId: 'u1', message: 'Mensagem' }),
    )
    expect(res.status).toBe(400)
    expect(mocks.sendUserDm).not.toHaveBeenCalled()
  })

  it('retorna 400 quando message está ausente', async () => {
    const res = await app.fetch(
      makeRequest({ discordUserId: 'u1', title: 'Título' }),
    )
    expect(res.status).toBe(400)
    expect(mocks.sendUserDm).not.toHaveBeenCalled()
  })

  it('retorna 200 com ok:true quando DM enviada com sucesso', async () => {
    mocks.sendUserDm.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makeRequest({
        discordUserId: 'discord-user-1',
        title: 'Nenhuma atividade encontrada',
        message: 'Não encontrei commits hoje.',
        color: 0xf39c12,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    expect(mocks.sendUserDm).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: 'discord-user-1',
        title: 'Nenhuma atividade encontrada',
        message: 'Não encontrei commits hoje.',
        color: 0xf39c12,
      }),
    )
  })

  it('retorna 200 com ok:false quando DM falha (non-fatal para worker)', async () => {
    const { ExternalServiceError } = await import('@standup/domain')
    mocks.sendUserDm.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord',
          message: 'User has DMs disabled',
        }),
      ),
    )

    const res = await app.fetch(
      makeRequest({
        discordUserId: 'discord-user-1',
        title: 'Teste',
        message: 'Mensagem de teste',
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; reason: string }
    expect(body.ok).toBe(false)
    expect(body.reason).toMatch(/DMs disabled/)
  })

  it('funciona sem color opcional (usa padrão azul)', async () => {
    mocks.sendUserDm.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makeRequest({
        discordUserId: 'discord-user-1',
        title: 'Job em andamento',
        message: 'Aguarde.',
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.sendUserDm).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: 'discord-user-1',
        color: 0x3498db, // EMBED_COLORS.REVIEW padrão
      }),
    )
  })
})
