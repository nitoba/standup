import { ConflictException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ExternalServiceError, Result } from '../../../shared/domain'
import { DiscordTriggerService } from './discord-trigger.service'

describe('DiscordTriggerService', () => {
  it('returns accepted when the local trigger succeeds', async () => {
    const triggerStandup = {
      trigger: vi.fn().mockResolvedValue({ ok: true, accepted: true }),
    }

    const service = new DiscordTriggerService(triggerStandup as never)

    await expect(
      service.trigger('user-1', 'discord-1', {
        forceRegenerate: true,
      }),
    ).resolves.toEqual(Result.ok({ accepted: true }))

    expect(triggerStandup.trigger).toHaveBeenCalledWith(
      {
        forceRegenerate: true,
        extraContext: undefined,
        rewriteFromStandupId: undefined,
        rewriteInstruction: undefined,
        replaceStandupId: undefined,
      },
      null,
      { userId: 'user-1', discordUserId: 'discord-1' },
    )
  })

  it('maps pending review conflicts to a non-accepted outcome', async () => {
    const triggerStandup = {
      trigger: vi.fn().mockRejectedValue(
        new ConflictException({
          ok: false,
          accepted: false,
          reason: 'pending_review_exists',
          standupId: 'standup-1',
          message: 'Já existe um standup pendente de revisão para hoje.',
        }),
      ),
    }

    const service = new DiscordTriggerService(triggerStandup as never)
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
    const triggerStandup = {
      trigger: vi.fn().mockRejectedValue(
        new ExternalServiceError({
          service: 'standups',
          message: 'Failed to trigger standup: User settings not found',
        }),
      ),
    }

    const service = new DiscordTriggerService(triggerStandup as never)
    const result = await service.trigger('user-1', 'discord-1')

    expect(result.isErr()).toBe(true)
    if (result.isOk()) {
      throw new Error('expected trigger to fail')
    }
    expect(result.error).toBeInstanceOf(ExternalServiceError)
    expect(result.error.message).toContain('Failed to trigger standup')
  })
})
