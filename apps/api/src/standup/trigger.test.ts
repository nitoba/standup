import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandupJob: vi.fn(),
  listStandups: vi.fn(),
  getStandupById: vi.fn(),
  updateStandupStatus: vi.fn(),
  getDb: vi.fn(),
  findDiscordIdByUserId: vi.fn(),
}))

vi.mock('../services/standup-trigger-service.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
}))

vi.mock('../services/standup-service.js', () => ({
  listStandups: mocks.listStandups,
  getStandupById: mocks.getStandupById,
  updateStandupStatus: mocks.updateStandupStatus,
}))

vi.mock('@standup/db', () => {
  function UserRepository() {
    return {
      findDiscordIdByUserId: mocks.findDiscordIdByUserId,
    }
  }
  return { getDb: mocks.getDb, UserRepository }
})

import { Hono } from 'hono'
import { createStandupRouter } from './router.js'

const deps = {
  databaseUrl: ':memory:',
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

const TEST_USER_ID = 'test-user-1'
const TEST_DISCORD_USER_ID = 'discord-user-123'

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/standups/trigger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /standups/trigger', () => {
  let app: Hono<{ Variables: { user: Record<string, unknown> } }>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findDiscordIdByUserId.mockReturnValue(Result.ok(TEST_DISCORD_USER_ID))
    const router = createStandupRouter(deps)
    app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    app.route('/', router)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 202 quando sessão válida e worker aceita trigger', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(202)
    const body = (await res.json()) as { ok: boolean; accepted: boolean }
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(true)
    expect(mocks.triggerStandupJob).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        extraContext: undefined,
        forceRegenerate: undefined,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
      },
    )
  })

  it('propaga extraContext e forceRegenerate ao triggerStandupJob', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makePostRequest({
        extraContext: 'focar no card #1234',
        forceRegenerate: true,
      }),
    )

    expect(res.status).toBe(202)
    expect(mocks.triggerStandupJob).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        extraContext: 'focar no card #1234',
        forceRegenerate: true,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
      },
    )
  })

  it('propaga rewriteFromStandupId e rewriteInstruction ao triggerStandupJob', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makePostRequest({
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover seção X e incluir seção Y',
      }),
    )

    expect(res.status).toBe(202)
    expect(mocks.triggerStandupJob).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        extraContext: undefined,
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover seção X e incluir seção Y',
      },
    )
  })

  it('retorna 400 quando discordUserId não pode ser resolvido', async () => {
    mocks.findDiscordIdByUserId.mockReturnValue(Result.ok(null))

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(400)
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 503 quando worker está indisponível', async () => {
    mocks.triggerStandupJob.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'worker',
          message: 'ECONNREFUSED',
        }),
      ),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Worker unavailable')
  })
})
