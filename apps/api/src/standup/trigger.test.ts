import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  triggerStandupJob: vi.fn(),
  listStandups: vi.fn(),
  getStandupById: vi.fn(),
  updateStandupStatus: vi.fn(),
}))

vi.mock('../services/standup-trigger-service.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
}))

vi.mock('../services/standup-service.js', () => ({
  listStandups: mocks.listStandups,
  getStandupById: mocks.getStandupById,
  updateStandupStatus: mocks.updateStandupStatus,
}))

import { createStandupRouter } from './router.js'

const deps = {
  databaseUrl: ':memory:',
  allowedDiscordUserId: 'discord-user-123',
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/standups/trigger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /standups/trigger', () => {
  let app: ReturnType<typeof createStandupRouter>

  beforeEach(() => {
    vi.clearAllMocks()
    app = createStandupRouter(deps)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna 202 quando usuário autorizado e worker aceita trigger', async () => {
    mocks.triggerStandupJob.mockResolvedValue(Result.ok(undefined))

    const res = await app.fetch(
      makePostRequest({ discordUserId: deps.allowedDiscordUserId }),
    )

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
        discordUserId: deps.allowedDiscordUserId,
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
        discordUserId: deps.allowedDiscordUserId,
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
        extraContext: undefined,
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Remover seção X e incluir seção Y',
      },
    )
  })

  it('retorna 403 quando discordUserId não é autorizado', async () => {
    const res = await app.fetch(
      makePostRequest({ discordUserId: 'discord-user-999' }),
    )

    expect(res.status).toBe(403)
    expect(mocks.triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 400 para body inválido', async () => {
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

    const res = await app.fetch(
      makePostRequest({ discordUserId: deps.allowedDiscordUserId }),
    )

    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Worker unavailable')
  })
})
