import { createServer } from 'node:http'
import { Result } from '@standup/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerStandupJob as triggerStandupFromApi } from '../../../api/src/services/standup-trigger-service.js'
import { handleReminderInteraction } from '../../../discord-bot/src/discord/handlers/reminder-handler.js'
import { createInternalRouter as createBotRouter } from '../../../discord-bot/src/http/router.js'
import { createInternalRouter as createWorkerRouter } from '../http/router.js'
import { notifyStandupReady } from '../notifications/notify-standup-ready.js'
import { notifyStandupReminder } from '../notifications/notify-standup-reminder.js'

const mocks = vi.hoisted(() => ({
  notifyStandupReady: vi.fn(),
  sendReminderDm: vi.fn(),
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

const dbMocks = vi.hoisted(() => ({
  findUserIdByDiscordId: vi.fn(),
  updateSnoozedUntil: vi.fn(),
  updateCancelledDate: vi.fn(),
}))

vi.mock('@standup/db', () => ({
  getDb: vi.fn(),
  UserRepository: function UserRepository() {
    return { findUserIdByDiscordId: dbMocks.findUserIdByDiscordId }
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

afterEach(() => {
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
      discordUserId: 'discord-user-1',
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
      discordUserId: 'discord-user-1',
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
          reposBasePath: '/tmp/repos',
          gitAuthor: 'dev@example.com',
          gitSincePeriod: '16 hours ago',
          extraContext: 'focar em PR review',
          forceRegenerate: true,
        },
      )

      expect(result.isOk()).toBe(true)
      expect(triggerStandupJob).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        discordUserId: TEST_DISCORD_USER_ID,
        reposBasePath: '/tmp/repos',
        gitAuthor: 'dev@example.com',
        gitSincePeriod: '16 hours ago',
        extraContext: 'focar em PR review',
        forceRegenerate: true,
      })
    } finally {
      await server.close()
    }
  })

  it('bot -> worker: actions snooze/cancel usam contratos aceitos pelo router do worker', async () => {
    // Mock DB lookups for the reminder handler
    dbMocks.findUserIdByDiscordId.mockReturnValue(Result.ok(TEST_USER_ID))
    dbMocks.updateSnoozedUntil.mockResolvedValue(Result.ok(undefined))
    dbMocks.updateCancelledDate.mockResolvedValue(Result.ok(undefined))

    const workerApp = createWorkerRouter({
      internalSecret: INTERNAL_SECRET,
      databaseUrl: ':memory:',
      triggerStandupJob: vi.fn().mockResolvedValue(undefined),
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
