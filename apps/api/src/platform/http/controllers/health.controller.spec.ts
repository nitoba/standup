import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { HealthController } from './health.controller'

function createController(overrides?: {
  dbOk?: boolean
  discordEnabled?: boolean
  discordReady?: boolean
}) {
  const database = {
    db: {
      select:
        overrides?.dbOk === false
          ? vi.fn(() => ({
              from: vi.fn(() => ({
                get: vi.fn().mockRejectedValue(new Error('db down')),
              })),
            }))
          : vi.fn(() => ({
              from: vi.fn(() => ({
                get: vi.fn().mockResolvedValue({ count: 1 }),
              })),
            })),
    },
  }
  const env = {
    discord: {
      gatewayEnabled: overrides?.discordEnabled ?? true,
    },
  }
  const messages = {
    isReady: vi.fn().mockReturnValue(overrides?.discordReady ?? true),
  }

  return new HealthController(
    database as never,
    env as never,
    messages as never,
  )
}

describe('HealthController', () => {
  it('returns ready when database is reachable and discord is ready', async () => {
    const controller = createController()

    await expect(controller.getReady()).resolves.toEqual({
      status: 'ready',
      database: 'ok',
      discord: 'ok',
    })
  })

  it('returns ready with discord disabled when gateway is turned off', async () => {
    const controller = createController({ discordEnabled: false })

    await expect(controller.getReady()).resolves.toEqual({
      status: 'ready',
      database: 'ok',
      discord: 'disabled',
    })
  })

  it('throws 503 when database is not reachable', async () => {
    const controller = createController({ dbOk: false })

    await expect(controller.getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })

  it('throws 503 when discord is enabled but not ready', async () => {
    const controller = createController({ discordReady: false })

    await expect(controller.getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})
