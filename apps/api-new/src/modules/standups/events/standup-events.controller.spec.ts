import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { StandupEventsController } from './standup-events.controller'

describe('StandupEventsController', () => {
  it('throws when session is missing', () => {
    const controller = new StandupEventsController({
      subscribe: vi.fn(),
    } as never)

    expect(() => controller.stream(null)).toThrow(UnauthorizedException)
  })

  it('subscribes with the authenticated user id', () => {
    const stream = { subscribe: vi.fn() }
    const subscribe = vi.fn().mockReturnValue(stream)
    const controller = new StandupEventsController({
      subscribe,
    } as never)

    const result = controller.stream({
      user: { id: 'user-1' },
    })

    expect(subscribe).toHaveBeenCalledWith('user-1')
    expect(result).toBe(stream)
  })
})
