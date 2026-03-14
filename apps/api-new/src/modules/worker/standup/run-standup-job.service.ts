import { Injectable } from '@nestjs/common'
import { JobAlreadyCompletedError, LockAlreadyHeldError } from '@standup/domain'
import { JobRunRepository } from '../../../shared/database/repositories/job-run.repository'
import { AppLoggerFactory } from '../../../shared/logger'
import { LocalDateService } from '../../../shared/time/local-date.service'
import { WorkerEventPublisherService } from '../worker-event-publisher.service'
import { resolveRunMode } from './resolve-run-mode'
import { StandupPipelineService } from './standup-pipeline.service'
import type { StandupJobOptions } from './types'

@Injectable()
export class RunStandupJobService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly jobRunRepository: JobRunRepository,
    private readonly pipeline: StandupPipelineService,
    private readonly notifications: WorkerEventPublisherService,
    private readonly localDateService: LocalDateService,
  ) {
    this.logger = this.loggerFactory.create('standup-job')
  }

  async run(options: StandupJobOptions): Promise<void> {
    const runId = crypto.randomUUID()
    const today = this.localDateService.today(options.timezone)
    const runMode = resolveRunMode(options)
    const jobLogger = this.logger.child({
      job: 'standup',
      run: runId,
      date: today,
    })

    const lockResult = await this.jobRunRepository.acquireLock({
      id: runId,
      jobName: 'standup',
      date: today,
      userId: options.userId,
      forceRegenerate: options.forceRegenerate,
    })

    if (lockResult.isErr()) {
      await this.handleLockError(lockResult.error, options)
      return
    }

    if (options.discordUserId.trim()) {
      this.notifications.notifyUserDm({
        discordUserId: options.discordUserId,
        title: '⏳ Gerando seu standup',
        message:
          'Seu standup está sendo gerado em background. Você receberá uma DM assim que estiver pronto para revisão.',
        color: 0x3498db,
      })
    }

    const result = await this.pipeline.execute({
      options,
      runId,
      today,
      runMode,
    })

    if (result.isErr()) {
      await this.jobRunRepository.releaseLock(
        runId,
        'failed',
        result.error.message,
      )
      this.notifications.emitStandupFailed({
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        message: result.error.message,
      })
      this.notifications.notifyJobFailed({
        error: result.error.message,
        context: 'standup-job',
        discordUserId: options.discordUserId,
      })
      return
    }

    await this.jobRunRepository.releaseLock(runId, 'success')
    jobLogger.info('Standup job completed', { standupId: result.value ?? null })
  }

  private async handleLockError(
    error: Error,
    options: StandupJobOptions,
  ): Promise<void> {
    if (LockAlreadyHeldError.is(error)) {
      this.notifications.notifyUserDm({
        discordUserId: options.discordUserId,
        title: '⏳ Standup já em processamento',
        message:
          'Seu standup já está sendo gerado em background. Você receberá uma DM assim que estiver pronto.',
        color: 0xf39c12,
      })
      return
    }

    if (JobAlreadyCompletedError.is(error)) {
      this.notifications.notifyUserDm({
        discordUserId: options.discordUserId,
        title: '✅ Standup já gerado hoje',
        message:
          'O standup de hoje já foi gerado. Abra o dashboard para revisar ou aprovar.',
        color: 0x3498db,
      })
      return
    }
  }
}
