import { ExternalServiceError, Result } from '@standup/domain'
import { describe, expect, it, vi } from 'vitest'
import { DiscordTriggerService } from './discord-trigger.service'

describe('DiscordTriggerService', () => {
  it('returns accepted when the local trigger succeeds', async () => {
    const eventBus = {
      requestStandupTrigger: vi
        .fn()
        .mockResolvedValue(Result.ok({ accepted: true })),
    }

    const service = new DiscordTriggerService(eventBus as never)

    await expect(
      service.trigger('user-1', 'discord-1', {
        forceRegenerate: true,
      }),
    ).resolves.toMatchObject({
      value: { accepted: true },
    })
  })

  it('maps pending review conflicts to a non-accepted outcome', async () => {
    const eventBus = {
      requestStandupTrigger: vi.fn().mockResolvedValue(
        Result.ok({
          accepted: false,
          reason: 'pending_review_exists',
          standupId: 'standup-1',
        }),
      ),
    }

    const service = new DiscordTriggerService(eventBus as never)
    const result = await service.trigger('user-1', 'discord-1')

    expect(result.isOk()).toBe(true)
    if (result.isErr()) {
      throw result.error
    }
    expect(result.value).toEqual({
      accepted: false,
      reason: 'pending_review_exists',
      standupId: 'standup-1',
    })
  })

  it('wraps bad request failures as external service errors', async () => {
    const eventBus = {
      requestStandupTrigger: vi.fn().mockResolvedValue(
        Result.err(
          new ExternalServiceError({
            service: 'standups',
            message: 'Failed to trigger standup: User settings not found',
          }),
        ),
      ),
    }

    const service = new DiscordTriggerService(eventBus as never)
    const result = await service.trigger('user-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) {
      throw new Error('expected trigger to fail')
    }
    expect(result.error).toBeInstanceOf(ExternalServiceError)
    expect(result.error.message).toContain('Failed to trigger standup')
  })
})
