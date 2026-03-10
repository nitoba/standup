import { createServer } from 'node:http'
import { Result } from '@standup/domain'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleCancelTodayReminder } from '../../../api/src/reminders/cancel-today.js'
import { handleSnoozeReminder as handleApiSnoozeReminder } from '../../../api/src/reminders/snooze.js'
import { handleListRepos as handleApiListRepos } from '../../../api/src/repos/list.js'
import { triggerStandupJob as triggerStandupFromApi } from '../../../api/src/services/standup-trigger-service.js'
import { createStandupRouter as createApiStandupRouter } from '../../../api/src/standup/router.js'
import { handleReminderInteraction } from '../../../discord-bot/src/discord/handlers/reminder-handler.js'
import { createInternalRouter as createBotRouter } from '../../../discord-bot/src/http/router.js'
import { createInternalRouter as createWorkerRouter } from '../http/router.js'
import { notifyStandupReady } from '../notifications/notify-standup-ready.js'
import { notifyStandupReminder } from '../notifications/notify-standup-reminder.js'

const mocks = vi.hoisted(() => ({
  approveStandup: vi.fn(),
  notifyStandupReady: vi.fn(),
  sendReminderDm: vi.fn(),
}))

vi.mock('../../../api/src/services/standup-approve-service.js', () => ({
  approveStandup: mocks.approveStandup,
}))

vi.mock(
  '../../../discord-bot/src/services/standup-notification-service.js',
  () => ({
    notifyStandupReady: mocks.notifyStandupReady,
  }),
)

vi.mock(
  '../../../discord-bot/src/discord/notifications/send-reminder-dm.js',
  () => ({
    sendReminderDm: mocks.sendReminderDm,
  }),
)

// Necessário pois bot router importa standup-status-changed handler → standup-sync-service → @standup/db
vi.mock('../../../discord-bot/src/services/standup-sync-service.js', () => ({
  syncStandupStatus: vi.fn().mockResolvedValue({ isErr: () => false }),
}))

const dbMocks = vi.hoisted(() => ({
  hasActiveSession: vi.fn(),
  updateSnoozedUntil: vi.fn(),
  updateCancelledDate: vi.fn(),
}))

vi.mock('@standup/db', () => ({
  getDb: vi.fn(),
  UserRepository: function UserRepository() {
    return { hasActiveSession: dbMocks.hasActiveSession }
  },
  UserSettingsRepository: function UserSettingsRepository() {
    return {
      updateSnoozedUntil: dbMocks.updateSnoozedUntil,
      updateCancelledDate: dbMocks.updateCancelledDate,
    }
  },
}))

const INTERNAL_SECRET = 'test-secret'
const TEST_USER_ID = 'test-user-1'
const TEST_DISCORD_USER_ID = 'discord-user-1'

function createApiApp(workerInternalUrl) {
  const app = new Hono()

  app.use('*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID })
    return next()
  })

  app.get('/repos', (c) =>
    handleApiListRepos(c, {
      workerInternalUrl,
      internalSecret: INTERNAL_SECRET,
    }),
  )

  app.post('/reminders/snooze', (c) =>
    handleApiSnoozeReminder(c, {
      workerInternalUrl,
      internalSecret: INTERNAL_SECRET,
    }),
  )

  app.post('/reminders/cancel-today', (c) =>
    handleCancelTodayReminder(c, {
      workerInternalUrl,
      internalSecret: INTERNAL_SECRET,
    }),
  )

  app.route(
    '/',
    createApiStandupRouter({
      databaseUrl: ':memory:',
      reposRootPath: '/tmp/repos',
      workerInternalUrl,
      internalSecret: INTERNAL_SECRET,
      botInternalUrl: 'http://localhost:3334',
      eventBus: { subscribe: vi.fn(), emit: vi.fn(), emitToAll: vi.fn() },
    }),
  )

  return app
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function startHonoServer(app) {
  const server = createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            headers.append(key, item)
          }
          continue
        }

        if (typeof value === 'string') {
          headers.set(key, value)
        }
      }

      const requestInit = {
        method: req.method,
        headers,
      }

      if (req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0) {
        requestInit.body = body
      }

      const request = new Request(
        `http://127.0.0.1${req.url ?? '/'}`,
        requestInit,
      )
      const response = await app.fetch(request)

      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })

      const responseBody = Buffer.from(await response.arrayBuffer())
      res.end(responseBody)
    } catch {
      res.statusCode = 500
      res.end('internal test server error')
    }
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start test server')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      })
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-09T17:48:50.203Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Cross-service HTTP contracts', () => {
  it('worker -> bot: notifyStandupReady envia payload aceito pelo router do bot', async () => {
    mocks.notifyStandupReady.mockResolvedValue(
      Result.ok({
        standupId: 'standup-123',
        dmSent: true,
        transitioned: true,
      }),
    )

    const botApp = createBotRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      client: {},
      discordChannelId: 'discord-channel-1',
      workerInternalUrl: 'http://localhost:3335',
    })

    const server = await startHonoServer(botApp)
    try {
      const result = await notifyStandupReady({
        botInternalUrl: server.baseUrl,
        standupId: 'standup-123',
        discordUserId: TEST_DISCORD_USER_ID,
        secret: INTERNAL_SECRET,
      })

      expect(result.isOk()).toBe(true)
      expect(mocks.notifyStandupReady).toHaveBeenCalledWith('standup-123', {
        databaseUrl: ':memory:',
        client: {},
        discordUserId: TEST_DISCORD_USER_ID,
      })
    } finally {
      await server.close()
    }
  })

  it('worker -> bot: notifyStandupReminder envia payload aceito pelo router do bot', async () => {
    mocks.sendReminderDm.mockResolvedValue(Result.ok({ messageId: 'msg-1' }))

    const botApp = createBotRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      client: {},
      discordChannelId: 'discord-channel-1',
      workerInternalUrl: 'http://localhost:3335',
    })

    const server = await startHonoServer(botApp)
    try {
      const nextRunAt = '2026-03-06T17:30:00.000Z'
      const result = await notifyStandupReminder({
        botInternalUrl: server.baseUrl,
        secret: INTERNAL_SECRET,
        nextRunAt,
        discordUserId: 'discord-user-1',
      })

      expect(result.isOk()).toBe(true)
      expect(mocks.sendReminderDm).toHaveBeenCalledWith(nextRunAt, {
        client: {},
        discordUserId: 'discord-user-1',
        workerInternalUrl: 'http://localhost:3335',
        internalSecret: INTERNAL_SECRET,
      })
    } finally {
      await server.close()
    }
  })

  it('api -> worker: triggerStandupJob envia contrato aceito pelo router do worker', async () => {
    const triggerStandupJob = vi.fn().mockResolvedValue(undefined)
    const workerApp = createWorkerRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      triggerStandupJob,
      mcpClient: {},
      azureProjects: ['AGROTRACE'],
    })

    const server = await startHonoServer(workerApp)
    try {
      const result = await triggerStandupFromApi(
        {
          workerInternalUrl: server.baseUrl,
          internalSecret: INTERNAL_SECRET,
        },
        {
          userId: TEST_USER_ID,
          discordUserId: TEST_DISCORD_USER_ID,
          reposRootPath: '/tmp/repos',
          selectedRepos: ['agrotrace-web', 'agrotrace-api'],
          gitAuthor: 'dev@example.com',
          extraContext: 'focar em PR review',
          forceRegenerate: true,
        },
      )

      expect(result.isOk()).toBe(true)
      expect(triggerStandupJob).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        reposRootPath: '/tmp/repos',
        selectedRepos: ['agrotrace-web', 'agrotrace-api'],
        gitAuthor: 'dev@example.com',
        extraContext: 'focar em PR review',
        forceRegenerate: true,
      })
    } finally {
      await server.close()
    }
  })

  it('api -> worker: GET /repos usa contrato aceito pelo router do worker', async () => {
    const listRepositories = vi
      .fn()
      .mockResolvedValueOnce(
        Result.ok([
          { id: 'repo-1', name: 'agrotrace-web', project: 'AGROTRACE' },
        ]),
      )
      .mockResolvedValueOnce(
        Result.ok([
          { id: 'repo-2', name: 'checkmilk-api', project: 'CHECKMILK' },
        ]),
      )

    const workerApp = createWorkerRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      triggerStandupJob: vi.fn().mockResolvedValue(undefined),
      mcpClient: { listRepositories },
      azureProjects: ['AGROTRACE', 'CHECKMILK'],
    })

    const workerServer = await startHonoServer(workerApp)
    try {
      const apiApp = createApiApp(workerServer.baseUrl)
      const response = await apiApp.request('/repos')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        data: [
          { id: 'repo-1', name: 'agrotrace-web', project: 'AGROTRACE' },
          { id: 'repo-2', name: 'checkmilk-api', project: 'CHECKMILK' },
        ],
      })
      expect(listRepositories).toHaveBeenNthCalledWith(1, 'AGROTRACE')
      expect(listRepositories).toHaveBeenNthCalledWith(2, 'CHECKMILK')
    } finally {
      await workerServer.close()
    }
  })

  it('api -> worker: reminder proxy routes usam contratos aceitos pelo router do worker', async () => {
    dbMocks.updateSnoozedUntil.mockResolvedValue(Result.ok(undefined))
    dbMocks.updateCancelledDate.mockResolvedValue(Result.ok(undefined))

    const workerApp = createWorkerRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      triggerStandupJob: vi.fn().mockResolvedValue(undefined),
      mcpClient: {},
      azureProjects: ['AGROTRACE'],
    })

    const workerServer = await startHonoServer(workerApp)
    try {
      const apiApp = createApiApp(workerServer.baseUrl)

      const snoozeResponse = await apiApp.request('/reminders/snooze', {
        method: 'POST',
      })

      expect(snoozeResponse.status).toBe(200)
      expect(await snoozeResponse.json()).toEqual({
        data: {
          ok: true,
          snoozedUntil: '2026-03-09T18:03:50.203Z',
        },
      })
      expect(dbMocks.updateSnoozedUntil).toHaveBeenCalledWith(
        TEST_USER_ID,
        Date.parse('2026-03-09T18:03:50.203Z'),
      )

      const cancelResponse = await apiApp.request('/reminders/cancel-today', {
        method: 'POST',
      })

      expect(cancelResponse.status).toBe(200)
      expect(await cancelResponse.json()).toEqual({
        data: {
          ok: true,
          cancelledDate: '2026-03-09',
        },
      })
      expect(dbMocks.updateCancelledDate).toHaveBeenCalledWith(
        TEST_USER_ID,
        '2026-03-09',
      )
    } finally {
      await workerServer.close()
    }
  })

  it('client -> api: approve route transitions standup to approved and returns 200', async () => {
    const approvedRecord = {
      id: 'standup-approve-1',
      date: '2026-03-09',
      meetingType: 'daily',
      content: 'conteudo aprovado',
      sourceData: '{}',
      customEntries: { directCalls: ['Sync com produto'] },
      status: 'approved',
      userId: TEST_USER_ID,
      createdAt: 1,
      updatedAt: 2,
      dmMessageId: null,
    }

    mocks.approveStandup.mockImplementation(
      async (standupId, userId, _deps, customEntries) => {
        expect(standupId).toBe('standup-approve-1')
        expect(userId).toBe(TEST_USER_ID)
        expect(customEntries).toEqual({
          scheduledMeetings: [],
          directCalls: ['Sync com produto'],
        })

        return Result.ok({ kind: 'success', standup: approvedRecord })
      },
    )

    const apiApp = createApiApp('http://worker-not-used')
    const response = await apiApp.fetch(
      new Request('http://localhost/standups/standup-approve-1/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customEntries: {
            scheduledMeetings: [],
            directCalls: ['Sync com produto'],
          },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: approvedRecord })
    expect(mocks.approveStandup).toHaveBeenCalledWith(
      'standup-approve-1',
      TEST_USER_ID,
      expect.objectContaining({ databaseUrl: ':memory:' }),
      { scheduledMeetings: [], directCalls: ['Sync com produto'] },
    )
  })

  it('bot -> worker: actions snooze/cancel usam contratos aceitos pelo router do worker', async () => {
    // Mock DB lookups for the reminder handler
    dbMocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: TEST_USER_ID, hasSession: true }),
    )
    dbMocks.updateSnoozedUntil.mockResolvedValue(Result.ok(undefined))
    dbMocks.updateCancelledDate.mockResolvedValue(Result.ok(undefined))

    const workerApp = createWorkerRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      triggerStandupJob: vi.fn().mockResolvedValue(undefined),
      mcpClient: {},
      azureProjects: ['AGROTRACE'],
    })

    const server = await startHonoServer(workerApp)
    try {
      const snoozeInteraction = {
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      }

      await handleReminderInteraction(snoozeInteraction, 'snooze', {
        workerInternalUrl: server.baseUrl,
        apiBaseUrl: 'http://localhost:3333',
        internalSecret: INTERNAL_SECRET,
        discordUserId: TEST_DISCORD_USER_ID,
        databaseUrl: ':memory:',
      })

      expect(snoozeInteraction.deferUpdate).toHaveBeenCalledTimes(1)
      expect(snoozeInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Standup adiado por 15 minutos.'),
        components: [],
      })

      const cancelInteraction = {
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      }

      await handleReminderInteraction(cancelInteraction, 'cancel-today', {
        workerInternalUrl: server.baseUrl,
        apiBaseUrl: 'http://localhost:3333',
        internalSecret: INTERNAL_SECRET,
        discordUserId: TEST_DISCORD_USER_ID,
        databaseUrl: ':memory:',
      })

      expect(cancelInteraction.deferUpdate).toHaveBeenCalledTimes(1)
      expect(cancelInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Standup cancelado para hoje.'),
        components: [],
      })
    } finally {
      await server.close()
    }
  })
})
