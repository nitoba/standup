import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { JobRunRepository } from '../../../../platform/database/repositories/job-run.repository'
import { UserRepository } from '../../../../platform/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../../platform/database/repositories/user-settings.repository'
import { userSettings } from '../../../../platform/database/schema'
import { AppLoggerFactory } from '../../../../platform/logger'
import { LocalDateService } from '../../../../platform/time/local-date.service'
import { parseSelectedRepos } from '../../../../shared/repos/parse-selected-repos'
import { WeeklyDigestDispatchService } from '../digests/weekly-digest-dispatch.service'
import { ReminderActionsService } from '../reminders/reminder-actions.service'
import { StandupDispatchService } from '../standup/standup-dispatch.service'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { isCronDueNow } from './is-cron-due-now'

const DIGEST_CRON = '0 9 * * 1'
const STALE_RUN_MAX_AGE_MS = 30 * 60 * 1000

type ActiveUserSettings = typeof userSettings.$inferSelect

@Injectable()
export class WorkerSchedulerService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly userRepository: UserRepository,
    private readonly jobRunRepository: JobRunRepository,
    private readonly standupDispatch: StandupDispatchService,
    private readonly weeklyDigestDispatch: WeeklyDigestDispatchService,
    private readonly reminderActions: ReminderActionsService,
    private readonly localDateService: LocalDateService,
  ) {
    this.logger = this.loggerFactory.create('worker-scheduler')
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'standup-scheduler-poll' })
  async handleSchedulerTick(): Promise<void> {
    if (
      !this.runtimeConfig.config.REPOS_ROOT_PATH ||
      !this.runtimeConfig.config.SCHEDULER_ENABLED
    ) {
      return
    }

    await this.userSettingsRepository.clearExpiredSnoozes()

    const activeResult = await this.userSettingsRepository.findAllActive()
    if (activeResult.isErr()) {
      return
    }

    const now = new Date()

    for (const settings of activeResult.value) {
      try {
        await this.processUserSettings(settings, now)
      } catch (error) {
        this.logger.error(
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  }

  private async processUserSettings(
    settings: ActiveUserSettings,
    now: Date,
  ): Promise<void> {
    const timezone = settings.timezone
    const today = this.localDateService.fromDate(now, timezone)

    if (settings.cancelledDate === today.iso) {
      return
    }

    if (settings.snoozedUntil && settings.snoozedUntil > now.getTime()) {
      return
    }

    const discordResult = await this.userRepository.findDiscordIdByUserId(
      settings.userId,
    )
    if (discordResult.isErr() || !discordResult.value) {
      return
    }

    if (isCronDueNow(settings.reminderCron, timezone, now)) {
      const nextRunAt = new Date(now.getTime() + 10 * 60_000).toISOString()
      this.reminderActions.notifyReminder(discordResult.value, nextRunAt)
    }

    if (isCronDueNow(settings.standupCron, timezone, now)) {
      const selectedRepos = parseSelectedRepos(settings.selectedRepos)
      const azureDevopsUser = settings.azureDevopsUser || undefined
      if (selectedRepos.length > 0 || azureDevopsUser) {
        this.standupDispatch.dispatchStandupJob({
          userId: settings.userId,
          discordUserId: discordResult.value,
          selectedRepos,
          gitAuthor: settings.gitAuthor,
          azureDevopsUser,
          azureDevopsUuid: settings.azureDevopsUuid || undefined,
          timezone,
          gitSincePeriod: settings.gitSincePeriod,
        })
      }
    }

    if (isCronDueNow(settings.recoveryCron, timezone, now)) {
      const staleResult =
        await this.jobRunRepository.findStaleRuns(STALE_RUN_MAX_AGE_MS)
      if (staleResult.isOk()) {
        for (const stale of staleResult.value) {
          await this.jobRunRepository.releaseLock(
            stale.id,
            'failed',
            'Stale: process likely crashed',
          )
        }
      }

      const runResult = await this.jobRunRepository.findByJobAndDate(
        'standup',
        today.iso,
        settings.userId,
      )
      if (runResult.isOk() && runResult.value?.status === 'success') {
        return
      }

      const recoveryRepos = parseSelectedRepos(settings.selectedRepos)
      const recoveryAzureUser = settings.azureDevopsUser || undefined
      if (recoveryRepos.length > 0 || recoveryAzureUser) {
        this.standupDispatch.dispatchStandupJob({
          userId: settings.userId,
          discordUserId: discordResult.value,
          selectedRepos: recoveryRepos,
          gitAuthor: settings.gitAuthor,
          azureDevopsUser: recoveryAzureUser,
          azureDevopsUuid: settings.azureDevopsUuid || undefined,
          timezone,
          gitSincePeriod: settings.gitSincePeriod,
        })
      }
    }

    if (isCronDueNow(DIGEST_CRON, timezone, now)) {
      this.weeklyDigestDispatch.dispatchWeeklyDigestJob({
        userId: settings.userId,
      })
    }
  }
}
