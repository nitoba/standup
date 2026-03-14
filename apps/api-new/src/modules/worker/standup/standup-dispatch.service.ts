import { Injectable } from '@nestjs/common'
import { Result, ValidationError } from '@standup/domain'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../shared/database/repositories/user-settings.repository'
import { AppLoggerFactory } from '../../../shared/logger'
import { parseSelectedRepos } from './parse-selected-repos'
import { RunStandupJobService } from './run-standup-job.service'
import type { StandupJobOptions } from './types'

@Injectable()
export class StandupDispatchService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly userRepository: UserRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly standupJob: RunStandupJobService,
  ) {
    this.logger = this.loggerFactory.create('standup-dispatch')
  }

  dispatchStandupJob(options: StandupJobOptions): void {
    void this.standupJob.run(options).catch((error: unknown) => {
      this.logger.error('Standup job threw unexpectedly', {
        userId: options.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  async dispatchStandupJobForUser(
    userId: string,
  ): Promise<Result<void, ValidationError>> {
    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId)
    if (settingsResult.isErr() || !settingsResult.value) {
      return Result.err(
        new ValidationError({
          field: 'userId',
          message: 'User settings not found',
        }),
      )
    }

    const discordResult =
      await this.userRepository.findDiscordIdByUserId(userId)
    if (discordResult.isErr() || !discordResult.value) {
      return Result.err(
        new ValidationError({
          field: 'userId',
          message: 'Discord identity not found',
        }),
      )
    }

    const selectedRepos = parseSelectedRepos(settingsResult.value.selectedRepos)
    if (selectedRepos.length === 0) {
      return Result.err(
        new ValidationError({
          field: 'selectedRepos',
          message: 'No repositories selected',
        }),
      )
    }

    this.dispatchStandupJob({
      userId,
      discordUserId: discordResult.value,
      selectedRepos,
      gitAuthor: settingsResult.value.gitAuthor,
      timezone: settingsResult.value.timezone,
      gitSincePeriod: settingsResult.value.gitSincePeriod,
    })

    return Result.ok(undefined)
  }
}
