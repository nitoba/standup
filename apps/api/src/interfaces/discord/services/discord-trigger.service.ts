import { ConflictException, Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../shared/domain'
import { TriggerStandupService } from '../../../contexts/standups/trigger/trigger-standup.service'

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
  constructor(private readonly triggerStandup: TriggerStandupService) {}

  async trigger(
    userId: string,
    discordUserId: string,
    options?: DiscordTriggerOptions,
  ): Promise<Result<DiscordTriggerOutcome, ExternalServiceError>> {
    try {
      const response = await this.triggerStandup.trigger(
        {
          userId,
          discordUserId,
          extraContext: options?.extraContext,
          forceRegenerate: options?.forceRegenerate,
          rewriteFromStandupId: options?.rewriteFromStandupId,
          rewriteInstruction: options?.rewriteInstruction,
          replaceStandupId: options?.replaceStandupId,
          reuseExistingSource: options?.reuseExistingSource,
        },
        null,
      )

      return Result.ok({
        accepted: response.accepted,
        ...(response.accepted ? {} : response),
      })
    } catch (error) {
      const outcome = this.toTriggerOutcome(error)

      if (outcome) {
        return Result.ok(outcome)
      }

      return Result.err(
        new ExternalServiceError({
          service: 'standups',
          message: `Failed to trigger standup: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    }
  }

  private toTriggerOutcome(
    error: unknown,
  ): Exclude<DiscordTriggerOutcome, { accepted: true }> | null {
    if (!(error instanceof ConflictException)) {
      return null
    }

    const response = error.getResponse()
    const payload =
      typeof response === 'object' && response !== null
        ? (response as {
            reason?: 'pending_review_exists' | 'already_approved_today'
            standupId?: string
          })
        : null

    if (
      payload?.reason !== 'pending_review_exists' &&
      payload?.reason !== 'already_approved_today'
    ) {
      return null
    }

    return {
      accepted: false,
      reason: payload.reason,
      standupId: payload.standupId,
    }
  }
}
