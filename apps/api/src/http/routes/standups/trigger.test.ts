import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandupJob: vi.fn(),
  listStandups: vi.fn(),
  getStandupById: vi.fn(),
  updateStandupStatus: vi.fn(),
  getDb: vi.fn(),
  findDiscordIdByUserId: vi.fn(),
  findSettingsByUserId: vi.fn(),
  findLatestByUserAndDate: vi.fn(),
}))

vi.mock('../../../services/worker-client.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
}))

vi.mock('../../../services/standup-service.js', () => ({
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
  function UserSettingsRepository() {
    return {
      findByUserId: mocks.findSettingsByUserId,
    }
  }
  function StandupRepository() {
    return {
      findLatestByUserAndDate: mocks.findLatestByUserAndDate,
    }
  }
  return {
    getDb: mocks.getDb,
    UserRepository,
    UserSettingsRepository,
    StandupRepository,
  }
})

import { Hono } from 'hono'
import { registerStandupRoutes } from './router.js'

const deps = {
  databaseUrl: ':memory:',
  reposRootPath: '/repos',
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
  botInternalUrl: 'http://localhost:3334',
  eventBus: {
    subscribe: vi.fn(),
    emit: vi.fn(),
    emitToAll: vi.fn(),
  } as unknown as import('../../sse/event-bus.js').EventBus,
}

const TEST_USER_ID = 'test-user-1'
const TEST_DISCORD_USER_ID = 'discord-user-123'
const TEST_SETTINGS = {
  selectedRepos: '["agrotrace-web","checkmilk-api"]',
  gitAuthor: 'dev@example.com',
}

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
    mocks.findSettingsByUserId.mockReturnValue(Result.ok(TEST_SETTINGS))
    mocks.findLatestByUserAndDate.mockResolvedValue(Result.ok(null))
    app = new Hono<{ Variables: { user: Record<string, unknown> } }>()
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID })
      return next()
    })
    registerStandupRoutes(app, deps)
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
        reposRootPath: '/repos',
        selectedRepos: ['agrotrace-web', 'checkmilk-api'],
        gitAuthor: 'dev@example.com',
        extraContext: undefined,
        forceRegenerate: undefined,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
        replaceStandupId: undefined,
        reuseExistingSource: false,
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
        reposRootPath: '/repos',
        selectedRepos: ['agrotrace-web', 'checkmilk-api'],
        gitAuthor: 'dev@example.com',
        extraContext: 'focar no card #1234',
        forceRegenerate: true,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
        replaceStandupId: undefined,
        reuseExistingSource: false,
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
        reposRootPath: '/repos',
        selectedRepos: ['agrotrace-web', 'checkmilk-api'],
        gitAuthor: 'dev@example.com',
        extraContext: undefined,
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover seção X e incluir seção Y',
        replaceStandupId: undefined,
        reuseExistingSource: false,
      },
    )
  })

  it('propaga replaceStandupId ao triggerStandupJob', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makePostRequest({
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
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
        reposRootPath: '/repos',
        selectedRepos: ['agrotrace-web', 'checkmilk-api'],
        gitAuthor: 'dev@example.com',
        extraContext: undefined,
        forceRegenerate: true,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
        replaceStandupId: 'standup-abc',
        reuseExistingSource: false,
      },
    )
  })

  it('retorna 409 quando já existe standup pendente hoje', async () => {
    mocks.findLatestByUserAndDate.mockResolvedValue(
      Result.ok({
        id: 'standup-pending',
        status: 'pending_review',
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      ok: false,
      accepted: false,
      reason: 'pending_review_exists',
      standupId: 'standup-pending',
    })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 409 quando o standup de hoje já foi aprovado', async () => {
    mocks.findLatestByUserAndDate.mockResolvedValue(
      Result.ok({
        id: 'standup-approved',
        status: 'approved',
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      ok: false,
      accepted: false,
      reason: 'already_approved_today',
      standupId: 'standup-approved',
    })
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('reutiliza o mesmo registro e o sourceData salvo quando o standup de hoje está rejeitado', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))
    mocks.findLatestByUserAndDate.mockResolvedValue(
      Result.ok({
        id: 'standup-rejected',
        status: 'rejected',
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(202)
    expect(mocks.triggerStandupJob).toHaveBeenCalledWith(
      {
        workerInternalUrl: deps.workerInternalUrl,
        internalSecret: deps.internalSecret,
      },
      {
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        reposRootPath: '/repos',
        selectedRepos: ['agrotrace-web', 'checkmilk-api'],
        gitAuthor: 'dev@example.com',
        extraContext: undefined,
        forceRegenerate: true,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
        replaceStandupId: 'standup-rejected',
        reuseExistingSource: true,
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

  it('retorna 400 quando selectedRepos está vazio', async () => {
    mocks.findSettingsByUserId.mockReturnValue(
      Result.ok({
        ...TEST_SETTINGS,
        selectedRepos: '[]',
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(400)
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })
})
