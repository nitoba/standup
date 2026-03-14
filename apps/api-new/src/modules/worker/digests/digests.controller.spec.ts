import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DigestsController } from './digests.controller'

describe('DigestsController', () => {
  it('uses the session userId when body userId is absent', () => {
    const weeklyDigestDispatch = {
      dispatchWeeklyDigestJob: vi.fn(),
    }
    const controller = new DigestsController(weeklyDigestDispatch as never)

    const result = controller.trigger({ user: { id: 'user-1' } }, undefined)

    expect(result).toEqual({ ok: true, accepted: true })
    expect(weeklyDigestDispatch.dispatchWeeklyDigestJob).toHaveBeenCalledWith({
      userId: 'user-1',
    })
  })

  it('prefers the body userId when provided', () => {
    const weeklyDigestDispatch = {
      dispatchWeeklyDigestJob: vi.fn(),
    }
    const controller = new DigestsController(weeklyDigestDispatch as never)

    controller.trigger({ user: { id: 'session-user' } }, 'body-user')

    expect(weeklyDigestDispatch.dispatchWeeklyDigestJob).toHaveBeenCalledWith({
      userId: 'body-user',
    })
  })

  it('throws when it cannot resolve the userId', () => {
    const weeklyDigestDispatch = {
      dispatchWeeklyDigestJob: vi.fn(),
    }
    const controller = new DigestsController(weeklyDigestDispatch as never)

    expect(() => controller.trigger(null, undefined)).toThrow(
      BadRequestException,
    )
  })
})
