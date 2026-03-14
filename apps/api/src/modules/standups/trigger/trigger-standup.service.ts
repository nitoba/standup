import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../shared/database/repositories/user-settings.repository'
import { ExternalServiceError, Result } from '../../../shared/domain'
import { parseSelectedRepos } from '../../../shared/repos/parse-selected-repos'
import { LocalDateService } from '../../../shared/time/local-date.service'
import { EventBusService } from '../../events/event-bus.service'
import {
  STANDUP_TRIGGER_REQUESTED_EVENT,
  type StandupTriggerRequestEvent,
  type StandupTriggerRequestOutcome,
} from '../../events/standup-events'
import type { TriggerStandupDto } from './trigger-standup.dto'

type AuthSession = {
  user: {
    id: string
  }
}

@Injectable()
export class TriggerStandupService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly standupRepository: StandupRepository,
    private readonly eventBus: EventBusService,
    private readonly localDateService: LocalDateService,
  ) {}

  @OnEvent(STANDUP_TRIGGER_REQUESTED_EVENT)
  async handleRequestedTrigger(
    event: StandupTriggerRequestEvent,
  ): Promise<Result<StandupTriggerRequestOutcome, ExternalServiceError>> {
    try {
      await this.trigger(event, null)
      return Result.ok({ accepted: true })
    } catch (error) {
      const payload = this.toTriggerOutcome(error)

      if (payload) {
        return Result.ok(payload)
      }

      return Result.err(
        new ExternalServiceError({
          service: 'standups',
          message: `Failed to trigger standup: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    }
  }

  async trigger(body: TriggerStandupDto, session: AuthSession | null) {
    let userId = body.userId
    let discordUserId = body.discordUserId

    if (session?.user.id) {
      userId = session.user.id
      const discordResult =
        await this.userRepository.findDiscordIdByUserId(userId)
      if (discordResult.isOk()) {
        discordUserId = discordResult.value ?? undefined
      }
    }

    if (!userId || !discordUserId) {
      throw new BadRequestException('Could not resolve userId or discordUserId')
    }

    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId)
    if (settingsResult.isErr() || !settingsResult.value) {
      throw new BadRequestException(
        'User settings not found. Configure your standup settings first.',
      )
    }

    const settings = settingsResult.value
    const selectedRepos = parseSelectedRepos(settings.selectedRepos)

    if (selectedRepos.length === 0) {
      throw new BadRequestException(
        'No repositories selected. Configure your repositories first.',
      )
    }

    const today = this.localDateService.today(settings.timezone)
    const todayStandupResult =
      await this.standupRepository.findLatestByUserAndDate(userId, today.iso)

    if (todayStandupResult.isErr()) {
      throw new BadRequestException(
        'Could not evaluate the current standup status.',
      )
    }

    const todayStandup = todayStandupResult.value
    const isExplicitReplace =
      body.forceRegenerate === true &&
      body.replaceStandupId != null &&
      body.replaceStandupId === todayStandup?.id

    if (todayStandup?.status === 'pending_review' && !isExplicitReplace) {
      throw new ConflictException({
        ok: false,
        accepted: false,
        reason: 'pending_review_exists',
        standupId: todayStandup.id,
      })
    }

    if (
      todayStandup?.status === 'approved' ||
      todayStandup?.status === 'published'
    ) {
      throw new ConflictException({
        ok: false,
        accepted: false,
        reason: 'already_approved_today',
        standupId: todayStandup.id,
      })
    }

    const shouldReuseRejectedStandup =
      !body.rewriteInstruction && todayStandup?.status === 'rejected'

    await this.eventBus.requestStandupJobDispatch({
      userId,
      discordUserId,
      selectedRepos,
      gitAuthor: settings.gitAuthor,
      timezone: settings.timezone,
      gitSincePeriod: settings.gitSincePeriod,
      extraContext: body.extraContext,
      forceRegenerate: shouldReuseRejectedStandup || body.forceRegenerate,
      rewriteFromStandupId: body.rewriteFromStandupId,
      rewriteInstruction: body.rewriteInstruction,
      replaceStandupId:
        body.replaceStandupId ??
        (shouldReuseRejectedStandup ? todayStandup?.id : undefined),
      reuseExistingSource:
        body.reuseExistingSource ?? shouldReuseRejectedStandup,
    })

    return { ok: true, accepted: true }
  }

  private toTriggerOutcome(
    error: unknown,
  ): Exclude<StandupTriggerRequestOutcome, { accepted: true }> | null {
    if (
      !error ||
      typeof error !== 'object' ||
      !('getResponse' in error) ||
      typeof error.getResponse !== 'function'
    ) {
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
