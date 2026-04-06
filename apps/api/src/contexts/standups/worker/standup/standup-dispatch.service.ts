import { Injectable } from '@nestjs/common'
import { UserRepository } from '../../../../platform/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../../platform/database/repositories/user-settings.repository'
import { AppLoggerFactory } from '../../../../platform/logger'
import { DbError, Result, ValidationError } from '../../../../shared/domain'
import { parseSelectedRepos } from '../../../../shared/repos/parse-selected-repos'
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
  ): Promise<Result<void, ValidationError | DbError>> {
    const optionsResult = await this.resolveStandupJobOptionsForUser(userId)

    if (optionsResult.isErr()) {
      return Result.err(optionsResult.error)
    }

    this.dispatchStandupJob(optionsResult.value)

    return Result.ok(undefined)
  }

  private async resolveStandupJobOptionsForUser(
    userId: string,
  ): Promise<Result<StandupJobOptions, ValidationError | DbError>> {
    const userSettingsRepository = this.userSettingsRepository
    const userRepository = this.userRepository

    return Result.gen(async function* () {
      const settings = yield* Result.await(
        userSettingsRepository.findByUserId(userId),
      )
      if (!settings) {
        return Result.err(
          new ValidationError({
            field: 'userId',
            message: 'User settings not found',
          }),
        )
      }

      const discordUserId = yield* Result.await(
        userRepository.findDiscordIdByUserId(userId),
      )
      if (!discordUserId) {
        return Result.err(
          new ValidationError({
            field: 'userId',
            message: 'Discord identity not found',
          }),
        )
      }

      const selectedRepos = parseSelectedRepos(settings.selectedRepos)
      const azureDevopsUser = settings.azureDevopsUser?.trim() || ''
      if (selectedRepos.length === 0 && !azureDevopsUser) {
        return Result.err(
          new ValidationError({
            field: 'sources',
            message:
              'At least one data source must be configured (git repos or Azure DevOps user)',
          }),
        )
      }

      return Result.ok({
        userId,
        discordUserId,
        selectedRepos,
        gitAuthor: settings.gitAuthor,
        azureDevopsUser: azureDevopsUser || undefined,
        azureDevopsUuid: settings.azureDevopsUuid || undefined,
        timezone: settings.timezone,
        gitSincePeriod: settings.gitSincePeriod,
      })
    })
  }
}
