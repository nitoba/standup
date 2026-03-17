import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EventBusService } from '../../../platform/events/event-bus.service'
import { AppLoggerFactory } from '../../../platform/logger'
import { LocalDateService } from '../../../platform/time/local-date.service'
import { parseSelectedRepos } from '../../../shared/repos/parse-selected-repos'
import type { MeSettingsRecord } from './me-settings.dto'
import { PutMeSettingsDto } from './me-settings.dto'

const DEFAULT_SETTINGS: MeSettingsRecord = {
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  gitAuthor: '',
  gitSincePeriod: '8 hours ago',
  selectedRepos: [],
  active: true,
  emailTheme: 'dark',
  snoozedUntil: null,
  cancelledDate: null,
  azureDevopsUser: null,
}

function createDefaultSettings(): MeSettingsRecord {
  return {
    ...DEFAULT_SETTINGS,
    selectedRepos: [...DEFAULT_SETTINGS.selectedRepos],
  }
}

@Injectable()
export class MeSettingsService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly localDateService: LocalDateService,
    private readonly eventBus: EventBusService,
  ) {
    this.logger = this.loggerFactory.create('me-settings-service')
  }

  async get(userId: string): Promise<MeSettingsRecord> {
    const result = await this.userSettingsRepository.findByUserId(userId)

    if (result.isErr()) {
      this.logger.error('Failed to load user settings', {
        userId,
        error: result.error.message,
      })
      throw new InternalServerErrorException('Internal server error')
    }

    if (result.value === null) {
      return createDefaultSettings()
    }

    return {
      standupCron: result.value.standupCron,
      reminderCron: result.value.reminderCron,
      recoveryCron: result.value.recoveryCron,
      timezone: result.value.timezone,
      gitAuthor: result.value.gitAuthor,
      gitSincePeriod: result.value.gitSincePeriod,
      selectedRepos: parseSelectedRepos(result.value.selectedRepos),
      active: result.value.active,
      emailTheme: result.value.emailTheme,
      snoozedUntil: result.value.snoozedUntil,
      cancelledDate: result.value.cancelledDate
        ? this.localDateService.formatIsoForTimezone(
            result.value.cancelledDate,
            result.value.timezone,
          )
        : null,
      azureDevopsUser: result.value.azureDevopsUser ?? null,
    }
  }

  async put(userId: string, body: PutMeSettingsDto): Promise<MeSettingsRecord> {
    const hasGitSource =
      (body.gitAuthor?.trim() ?? '').length > 0 &&
      (body.selectedRepos ?? []).length > 0
    const hasBoardSource = (body.azureDevopsUser?.trim() ?? '').length > 0
    if (!hasGitSource && !hasBoardSource) {
      throw new BadRequestException(
        'At least one data source must be configured: git repos with git author, or Azure DevOps user',
      )
    }

    // Read current settings for repo diff
    const currentResult = await this.userSettingsRepository.findByUserId(userId)
    const previousRepos =
      currentResult.isOk() && currentResult.value
        ? parseSelectedRepos(currentResult.value.selectedRepos)
        : []

    const result = await this.userSettingsRepository.upsert({
      userId,
      standupCron: body.standupCron,
      reminderCron: body.reminderCron,
      recoveryCron: body.recoveryCron,
      timezone: body.timezone,
      gitAuthor: body.gitAuthor ?? '',
      gitSincePeriod: body.gitSincePeriod ?? DEFAULT_SETTINGS.gitSincePeriod,
      selectedRepos: JSON.stringify(body.selectedRepos ?? []),
      azureDevopsUser: body.azureDevopsUser?.trim() || null,
      ...(body.active !== undefined && { active: body.active }),
      ...(body.emailTheme !== undefined && { emailTheme: body.emailTheme }),
    })

    if (result.isErr()) {
      this.logger.error('Failed to persist user settings', {
        userId,
        error: result.error.message,
      })
      throw new InternalServerErrorException('Internal server error')
    }

    // Emit event if there are new repos
    const selectedRepos = body.selectedRepos ?? []
    const previousSet = new Set(previousRepos)
    const newRepos = selectedRepos.filter((r) => !previousSet.has(r))
    if (newRepos.length > 0) {
      this.eventBus.emitSettingsReposChanged({
        userId,
        selectedRepos: newRepos,
      })
    }

    return {
      standupCron: result.value.standupCron,
      reminderCron: result.value.reminderCron,
      recoveryCron: result.value.recoveryCron,
      timezone: result.value.timezone,
      gitAuthor: result.value.gitAuthor,
      gitSincePeriod: result.value.gitSincePeriod,
      selectedRepos: parseSelectedRepos(result.value.selectedRepos),
      active: result.value.active,
      emailTheme: result.value.emailTheme,
      snoozedUntil: result.value.snoozedUntil,
      cancelledDate: result.value.cancelledDate
        ? this.localDateService.formatIsoForTimezone(
            result.value.cancelledDate,
            result.value.timezone,
          )
        : null,
      azureDevopsUser: result.value.azureDevopsUser ?? null,
    }
  }
}
