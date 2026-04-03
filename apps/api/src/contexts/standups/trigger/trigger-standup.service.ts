import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { LocalDateService } from '../../../platform/time/local-date.service'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { parseSelectedRepos } from '../../../shared/repos/parse-selected-repos'
import { StandupDispatchService } from '../worker/standup/standup-dispatch.service'
import type { TriggerStandupDto } from './trigger-standup.dto'

@Injectable()
export class TriggerStandupService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly standupRepository: StandupReadRepository,
    private readonly standupDispatch: StandupDispatchService,
    private readonly localDateService: LocalDateService,
  ) {}

  async trigger(
    body: TriggerStandupDto,
    session: AuthSession | null,
    /**
     * Pre-resolved identifiers for non-HTTP callers (e.g. Discord gateway).
     * When provided, these take precedence over session resolution.
     */
    resolvedIds?: { userId: string; discordUserId: string },
  ) {
    const userId: string | undefined = resolvedIds?.userId ?? session?.user.id
    let discordUserId: string | undefined = resolvedIds?.discordUserId

    if (!userId) {
      throw new BadRequestException('Could not resolve userId from session')
    }

    if (!discordUserId) {
      const discordResult =
        await this.userRepository.findDiscordIdByUserId(userId)
      discordUserId = discordResult.isOk()
        ? (discordResult.value ?? undefined)
        : undefined
    }

    if (!discordUserId) {
      throw new BadRequestException('Could not resolve discordUserId')
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
    const azureDevopsUser = settings.azureDevopsUser?.trim() || undefined

    if (selectedRepos.length === 0 && !azureDevopsUser) {
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
        message: 'Já existe um standup pendente de revisão para hoje.',
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
        message: 'O standup de hoje já foi aprovado ou publicado.',
        reason: 'already_approved_today',
        standupId: todayStandup.id,
      })
    }

    this.standupDispatch.dispatchStandupJob({
      userId,
      discordUserId,
      selectedRepos,
      gitAuthor: settings.gitAuthor,
      azureDevopsUser,
      azureDevopsUuid: settings.azureDevopsUuid || undefined,
      timezone: settings.timezone,
      gitSincePeriod: settings.gitSincePeriod,
      extraContext: body.extraContext,
      forceRegenerate: body.forceRegenerate,
      rewriteFromStandupId: body.rewriteFromStandupId,
      rewriteInstruction: body.rewriteInstruction,
      replaceStandupId: body.replaceStandupId,
    })

    return { ok: true, accepted: true }
  }
}
