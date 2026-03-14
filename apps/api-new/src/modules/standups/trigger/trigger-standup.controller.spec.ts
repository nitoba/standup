import { describe, expect, it, vi } from 'vitest'
import { TriggerStandupController } from './trigger-standup.controller'

describe('TriggerStandupController', () => {
  it('delegates trigger requests to the trigger service', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, accepted: true })
    const controller = new TriggerStandupController({
      trigger,
    } as never)

    const body = { discordUserId: 'discord-1' }
    const session = { user: { id: 'user-1' } }

    await expect(controller.trigger(session, body)).resolves.toEqual({
      ok: true,
      accepted: true,
    })
    expect(trigger).toHaveBeenCalledWith(body, session)
  })
})
