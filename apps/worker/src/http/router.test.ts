import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StandupJobOptions } from '../handlers/trigger-standup.js'
import { createInternalRouter } from './router.js'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  updateSnoozedUntil: vi.fn(),
  updateCancelledDate: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function UserSettingsRepository() {
    return {
      updateSnoozedUntil: mocks.updateSnoozedUntil,
      updateCancelledDate: mocks.updateCancelledDate,
    }
  }
  return { getDb: mocks.getDb, UserSettingsRepository }
})

const INTERNAL_SECRET = 'test-secret'
const TEST_USER_ID = 'test-user-1'
const TEST_DISCORD_USER_ID = 'discord-user-123'
const TRIGGER_BODY = {
  userId: TEST_USER_ID,
  discordUserId: TEST_DISCORD_USER_ID,
  reposRootPath: '/repos',
  selectedRepos: ['agrotrace-web', 'checkmilk-api'],
  gitAuthor: 'dev@example.com',
}

const triggerStandupJob = vi.fn<(options: StandupJobOptions) => Promise<void>>()

function makeRouter() {
  return createInternalRouter({
    internalSecret: INTERNAL_SECRET,
    databaseUrl: ':memory:',
    triggerStandupJob,
    mcpClient: {} as never,
    azureProjects: ['AGROTRACE', 'CHECKMILK'],
  })
}

function makeRequest(
  path: string,
  secret: string | null = INTERNAL_SECRET,
  body?: Record<string, unknown>,
): Request {
  const headers: Record<string, string> = {}
  if (secret !== null) headers['x-internal-secret'] = secret
  if (body) headers['content-type'] = 'application/json'

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('createInternalRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    triggerStandupJob.mockResolvedValue(undefined)
    mocks.updateSnoozedUntil.mockResolvedValue(Result.ok(undefined))
    mocks.updateCancelledDate.mockResolvedValue(Result.ok(undefined))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------

  it('GET /health retorna 200 com status ok e service worker (sem autenticação)', async () => {
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
    expect(body.service).toBe('worker')
    expect(typeof body.uptimeSeconds).toBe('number')
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  // ---------------------------------------------------------------------------
  // Auth middleware
  // ---------------------------------------------------------------------------

  it('retorna 401 quando secret esta ausente', async () => {
    const app = makeRouter()

    const res = await app.fetch(makeRequest('/internal/trigger/standup', null))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 401 quando secret esta incorreto', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', 'wrong-secret'),
    )

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // POST /internal/trigger/standup
  // ---------------------------------------------------------------------------

  it('retorna 202 e dispara runStandupJob quando secret e body estao corretos', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, TRIGGER_BODY),
    )

    expect(res.status).toBe(202)
    const body = (await res.json()) as { ok: boolean; accepted: boolean }
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(true)
    expect(triggerStandupJob).toHaveBeenCalledTimes(1)
  })

  it('retorna 400 quando userId e discordUserId estao ausentes', async () => {
    const app = makeRouter()

    const res = await app.fetch(makeRequest('/internal/trigger/standup'))

    expect(res.status).toBe(400)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 500 quando dispatch do trigger falha antes de iniciar', async () => {
    triggerStandupJob.mockImplementationOnce(() => {
      throw new Error('dispatch failed')
    })

    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, TRIGGER_BODY),
    )

    expect(res.status).toBe(500)
  })

  it('passa extraContext e forceRegenerate ao triggerStandupJob quando body presente', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, {
        ...TRIGGER_BODY,
        extraContext: 'focar mais no card #123',
        forceRegenerate: true,
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      ...TRIGGER_BODY,
      extraContext: 'focar mais no card #123',
      forceRegenerate: true,
    })
  })

  it('passa rewriteFromStandupId e rewriteInstruction ao triggerStandupJob quando fornecidos', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, {
        ...TRIGGER_BODY,
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover seção X e adicionar seção Y',
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      ...TRIGGER_BODY,
      forceRegenerate: true,
      rewriteFromStandupId: 'standup-abc',
      rewriteInstruction: 'Remover seção X e adicionar seção Y',
    })
  })

  it('passa replaceStandupId ao triggerStandupJob quando fornecido', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, {
        ...TRIGGER_BODY,
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      ...TRIGGER_BODY,
      forceRegenerate: true,
      replaceStandupId: 'standup-abc',
    })
  })

  it('passa reuseExistingSource ao triggerStandupJob quando fornecido', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, {
        ...TRIGGER_BODY,
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
        reuseExistingSource: true,
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      ...TRIGGER_BODY,
      forceRegenerate: true,
      replaceStandupId: 'standup-abc',
      reuseExistingSource: true,
    })
  })

  // ---------------------------------------------------------------------------
  // POST /internal/reminder/snooze
  // ---------------------------------------------------------------------------

  it('snooze: retorna 200 e persiste snoozedUntil no DB', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/reminder/snooze', INTERNAL_SECRET, {
        userId: TEST_USER_ID,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; snoozedUntil: string }
    expect(body.ok).toBe(true)
    expect(body.snoozedUntil).toBeDefined()
    expect(mocks.updateSnoozedUntil).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.any(Number),
    )

    // snoozedUntil should be ~15min in the future
    const snoozedMs = mocks.updateSnoozedUntil.mock.calls[0]?.[1] as number
    const now = Date.now()
    expect(snoozedMs).toBeGreaterThan(now + 14 * 60 * 1000)
    expect(snoozedMs).toBeLessThan(now + 16 * 60 * 1000)
  })

  it('snooze: retorna 400 quando userId esta ausente', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/reminder/snooze', INTERNAL_SECRET, {}),
    )

    expect(res.status).toBe(400)
    expect(mocks.updateSnoozedUntil).not.toHaveBeenCalled()
  })

  it('snooze: retorna 401 quando secret esta ausente', async () => {
    const app = makeRouter()

    const res = await app.fetch(makeRequest('/internal/reminder/snooze', null))

    expect(res.status).toBe(401)
    expect(mocks.updateSnoozedUntil).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // POST /internal/reminder/cancel
  // ---------------------------------------------------------------------------

  it('cancel: retorna 200 e persiste cancelledDate no DB', async () => {
    const app = makeRouter()
    const today = new Date().toISOString().slice(0, 10)

    const res = await app.fetch(
      makeRequest('/internal/reminder/cancel', INTERNAL_SECRET, {
        userId: TEST_USER_ID,
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; cancelledDate: string }
    expect(body.ok).toBe(true)
    expect(body.cancelledDate).toBe(today)
    expect(mocks.updateCancelledDate).toHaveBeenCalledWith(TEST_USER_ID, today)
  })

  it('cancel: retorna 400 quando userId esta ausente', async () => {
    const app = makeRouter()

    const res = await app.fetch(
      makeRequest('/internal/reminder/cancel', INTERNAL_SECRET, {}),
    )

    expect(res.status).toBe(400)
    expect(mocks.updateCancelledDate).not.toHaveBeenCalled()
  })

  it('cancel: retorna 401 quando secret esta ausente', async () => {
    const app = makeRouter()

    const res = await app.fetch(makeRequest('/internal/reminder/cancel', null))

    expect(res.status).toBe(401)
    expect(mocks.updateCancelledDate).not.toHaveBeenCalled()
  })
})
