import { describe, expect, it, vi } from 'vitest'
import { DiscordServiceHealthService } from './discord-service-health.service'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
}))

describe('DiscordServiceHealthService', () => {
  function createService(overrides?: {
    schedulerEnabled?: boolean
    reposRootPath?: string
    gatewayEnabled?: boolean
    token?: string
    channelId?: string
    isReady?: boolean
    dbOk?: boolean
  }) {
    const database = {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              count: overrides?.dbOk === false ? undefined : 0,
            }),
          }),
          get: vi.fn().mockResolvedValue({
            count: overrides?.dbOk === false ? undefined : 0,
          }),
        }),
      },
    }
    const env = {
      worker: {
        schedulerEnabled: overrides?.schedulerEnabled ?? true,
        reposRootPath: overrides?.reposRootPath ?? '/repos',
      },
      discord: {
        gatewayEnabled: overrides?.gatewayEnabled ?? true,
        token: overrides?.token ?? 'token',
        channelId: overrides?.channelId ?? 'channel',
      },
    }
    const messages = {
      isReady: vi.fn().mockReturnValue(overrides?.isReady ?? true),
    }

    return {
      database,
      env,
      messages,
      service: new DiscordServiceHealthService(
        database as never,
        env as never,
        messages as never,
      ),
    }
  }

  it('returns healthy statuses when the process dependencies are available', async () => {
    mocks.access.mockResolvedValue(undefined)
    const { service } = createService()

    await expect(service.listServices('all')).resolves.toEqual([
      expect.objectContaining({ service: 'api', ok: true }),
      expect.objectContaining({ service: 'worker', ok: true }),
      expect.objectContaining({ service: 'bot', ok: true }),
    ])
  })

  it('reports worker and bot failures using real dependency checks', async () => {
    mocks.access.mockRejectedValue(new Error('ENOENT'))
    const { service } = createService({
      isReady: false,
    })

    const statuses = await service.listServices('all')
    const worker = statuses.find((status) => status.service === 'worker')
    const bot = statuses.find((status) => status.service === 'bot')

    expect(worker).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'ENOENT',
      }),
    )
    expect(bot).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'Discord gateway not ready',
      }),
    )
  })
})
