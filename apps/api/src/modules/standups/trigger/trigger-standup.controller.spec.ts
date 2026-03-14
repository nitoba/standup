import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { TriggerStandupController } from './trigger-standup.controller'

describe('TriggerStandupController', () => {
  it('returns 401 without session', async () => {
    const controller = new TriggerStandupController({
      trigger: vi.fn(),
    } as never)

    expect(() => controller.trigger(null, {})).toThrow(UnauthorizedException)
  })

  it('delegates trigger requests to the trigger service', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, accepted: true })
    const controller = new TriggerStandupController({
      trigger,
    } as never)

    const body = { extraContext: 'contexto' }
    const session = { user: { id: 'user-1' } }

    await expect(controller.trigger(session, body)).resolves.toEqual({
      ok: true,
      accepted: true,
    })
    expect(trigger).toHaveBeenCalledWith(body, session)
  })
})
