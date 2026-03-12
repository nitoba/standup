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

vi.mock('../../../services/standup-approve-service.js', () => ({
  approveStandup: mocks.approveStandup,
}))

vi.mock('../../../services/worker-client.js', () => ({
  triggerStandupJob: mocks.triggerStandupJob,
  cancelReminderForToday: mocks.cancelReminderForToday,
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

  return { getDb: mocks.getDb, UserRepository, UserSettingsRepository }
})

import { Hono } from 'hono'
import { registerStandupRoutes } from './router.js'

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
  } as unknown as import('../../../sse/event-bus.js').EventBus,
}

const approvedStandup = {../../sse/event-bus.js
  id: 'standup-abc',
  date: '2026-03-09',
  meetingType: 'daily',
  content: 'conteudo',
  sourceData: '{}',
  customEntries: null,
  status: 'approved' as const,
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

  it('retorna 200 com data quando a aprovacao publica com sucesso', async () => {
    mocks.approveStandup.mockResolvedValue(Result.ok(approvedStandup))

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof approvedStandup }
    expect(body.data).toEqual(approvedStandup)
    expect(mocks.approveStandup).toHaveBeenCalledWith(
      'standup-abc',
      TEST_USER_ID,
      expect.objectContaining({ databaseUrl: deps.databaseUrl }),
      undefined,
    )
  })

  it('retorna 200 com data quando aprovar com customEntries', async () => {
    mocks.approveStandup.mockResolvedValue(Result.ok(approvedStandup))

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

  it('retorna 404 quando o standup nao existe', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-abc' })),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('retorna 409 para transicao invalida', async () => {
    mocks.approveStandup.mockResolvedValue(
      Result.err(
        new InvalidStateTransitionError({
          from: 'draft',
          to: 'approved',
        }),
      ),
    )

    const res = await app.fetch(makePostRequest({}))

    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/invalid.*transition/i)
  })

  it('retorna 400 quando customEntries e invalido', async () => {
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
