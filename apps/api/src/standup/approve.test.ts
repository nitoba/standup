import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  approveStandup: vi.fn(),
  triggerStandupJob: vi.fn(),
  listStandups: vi.fn(),
  getStandupById: vi.fn(),
  updateStandupStatus: vi.fn(),
  cancelReminderForToday: vi.fn(),
  getDb: vi.fn(),
  findDiscordIdByUserId: vi.fn(),
  findSettingsByUserId: vi.fn(),
}))

vi.mock('../services/standup-approve-service.js', () => ({
  approveStandup: mocks.approveStandup,
}))

vi.mock('../services/standup-trigger-service.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
}))

vi.mock('../services/standup-service.js', () => ({
  listStandups: mocks.listStandups,
  getStandupById: mocks.getStandupById,
  updateStandupStatus: mocks.updateStandupStatus,
}))

vi.mock('../services/worker-facade-service.js', () => ({
  cancelReminderForToday: mocks.cancelReminderForToday,
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

  return { getDb: mocks.getDb, UserRepository, UserSettingsRepository }
})

import { Hono } from 'hono'
import { createStandupRouter } from './router.js'

const TEST_USER_ID = 'test-user-1'
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
  } as unknown as import('../sse/event-bus.js').EventBus,
}

const publishedStandup = {
  id: 'standup-abc',
  date: '2026-03-09',
  meetingType: 'daily',
  content: 'conteudo',
  sourceData: '{}',
  customEntries: null,
  status: 'published' as const,
  userId: TEST_USER_ID,
  createdAt: 1000,
  dmMessageId: null,
  updatedAt: 2000,
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/standups/standup-abc/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /standups/:id/approve', () => {
  let app: Hono<{ Variables: { user: Record<string, unknown> } }>

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('retorna 200 com data quando a aprovação publica com sucesso', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.ok({ kind: 'success', standup: publishedStandup }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof publishedStandup }
    expect(body.data).toEqual(publishedStandup)
    expect(mocks.approveStandup).toHaveBeenCalledWith(
      'standup-abc',
      TEST_USER_ID,
      expect.objectContaining({ databaseUrl: deps.databaseUrl }),
      undefined,
    )
  })

  it('retorna 200 com data quando aprovar com customEntries', async () => {
    const approvedStandup = { ...publishedStandup, status: 'approved' as const }
    mocks.approveStandup.mockResolvedValue(
      Result.ok({ kind: 'success', standup: approvedStandup }),
    )

    const res = await app.fetch(
      makePostRequest({
        customEntries: {
          scheduledMeetings: ['Planning'],
          directCalls: ['Call com produto'],
        },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { status: string } }
    expect(body.data.status).toBe('approved')
    expect(mocks.approveStandup).toHaveBeenCalledWith(
      'standup-abc',
      TEST_USER_ID,
      expect.objectContaining({ databaseUrl: deps.databaseUrl }),
      {
        scheduledMeetings: ['Planning'],
        directCalls: ['Call com produto'],
      },
    )
  })

  it('retorna 404 quando o standup não existe', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.ok({
        kind: 'not_found',
        error: new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 409 para transição inválida', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.ok({
        kind: 'invalid_transition',
        error: new InvalidStateTransitionError({
          from: 'draft',
          to: 'approved',
        }),
      }),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/invalid.*transition/i)
  })

  it('retorna 400 quando customEntries é inválido', async () => {
    const res = await app.fetch(
      makePostRequest({
        customEntries: {
          scheduledMeetings: 'Planning',
          directCalls: [],
        },
      }),
    )

    expect(res.status).toBe(400)
    expect(mocks.approveStandup).not.toHaveBeenCalled()
  })

  it('retorna 500 quando o service falha com DbError', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.err(
        new DbError({ operation: 'approveStandup', message: 'disk full' }),
      ),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Internal server error')
  })
})
