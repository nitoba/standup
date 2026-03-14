import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ExternalServiceError, Result } from '@standup/domain'
import {
  STANDUP_TRIGGER_REQUESTED_EVENT,
  type StandupTriggerRequestEvent,
  type StandupTriggerRequestOutcome,
} from '../../events/standup-events'
import { TriggerStandupService } from './trigger-standup.service'

@Injectable()
export class StandupTriggerRequestedListener {
  constructor(private readonly triggerStandup: TriggerStandupService) {}

  @OnEvent(STANDUP_TRIGGER_REQUESTED_EVENT)
  async handle(
    event: StandupTriggerRequestEvent,
  ): Promise<Result<StandupTriggerRequestOutcome, ExternalServiceError>> {
    try {
      await this.triggerStandup.trigger(event, null)
      return Result.ok({ accepted: true })
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'getResponse' in error &&
        typeof error.getResponse === 'function'
      ) {
        const response = error.getResponse()
        const payload =
          typeof response === 'object' && response !== null
            ? (response as {
                reason?: 'pending_review_exists' | 'already_approved_today'
                standupId?: string
              })
            : null

        if (
          payload?.reason === 'pending_review_exists' ||
          payload?.reason === 'already_approved_today'
        ) {
          return Result.ok({
            accepted: false,
            reason: payload.reason,
            standupId: payload.standupId,
          })
        }
      }

      return Result.err(
        new ExternalServiceError({
          service: 'standups',
          message: `Failed to trigger standup: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    }
  }
}
