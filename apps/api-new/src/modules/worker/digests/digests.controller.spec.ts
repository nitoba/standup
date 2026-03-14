import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DigestsController } from './digests.controller'

describe('DigestsController', () => {
  it('uses the session userId', () => {
    const weeklyDigestDispatch = {
      dispatchWeeklyDigestJob: vi.fn(),
    }
    const controller = new DigestsController(weeklyDigestDispatch as never)

    const result = controller.trigger({ user: { id: 'user-1' } })

    expect(result).toEqual({ ok: true, accepted: true })
    expect(weeklyDigestDispatch.dispatchWeeklyDigestJob).toHaveBeenCalledWith({
      userId: 'user-1',
    })
  })

  it('throws when there is no authenticated session', () => {
    const weeklyDigestDispatch = {
      dispatchWeeklyDigestJob: vi.fn(),
    }
    const controller = new DigestsController(weeklyDigestDispatch as never)

    expect(() => controller.trigger(null)).toThrow(UnauthorizedException)
  })
})
