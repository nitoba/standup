import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '@standup/domain'
import { EventBusService } from '../../events/event-bus.service'
import type { StandupTriggerRequestOutcome } from '../../events/standup-events'

export interface DiscordTriggerOptions {
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

export type DiscordTriggerOutcome =
  | { accepted: true }
  | {
      accepted: false
      reason: 'pending_review_exists' | 'already_approved_today'
      standupId?: string
    }

@Injectable()
export class DiscordTriggerService {
  constructor(private readonly eventBus: EventBusService) {}

  async trigger(
    userId: string,
    discordUserId: string,
    options?: DiscordTriggerOptions,
  ): Promise<Result<DiscordTriggerOutcome, ExternalServiceError>> {
    const response = await this.eventBus.requestStandupTrigger<
      Result<StandupTriggerRequestOutcome, ExternalServiceError>
    >({
      userId,
      discordUserId,
      extraContext: options?.extraContext,
      forceRegenerate: options?.forceRegenerate,
      rewriteFromStandupId: options?.rewriteFromStandupId,
      rewriteInstruction: options?.rewriteInstruction,
      replaceStandupId: options?.replaceStandupId,
      reuseExistingSource: options?.reuseExistingSource,
    })

    if (!response) {
      return Result.err(
        new ExternalServiceError({
          service: 'standups',
          message: 'No listener handled the standup trigger request',
        }),
      )
    }

    return response
  }
}
