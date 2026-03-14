import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { DbError, NotFoundError, Result } from '../../../shared/domain'
import { AppLoggerFactory } from '../../../shared/logger'
import type {
  StandupProgressStep,
  StandupRunMode,
} from '../../events/standup-events'
import { WorkerEventPublisherService } from '../worker-event-publisher.service'
import { ExecuteAdjustStrategy } from './strategies/execute-adjust-strategy'
import { ExecuteGenerateStrategy } from './strategies/execute-generate-strategy'
import { ExecuteRegenerateStrategy } from './strategies/execute-regenerate-strategy'
import type { StandupJobOptions, StrategyProgressUpdate } from './types'

interface PipelineContext {
  options: StandupJobOptions
  runId: string
  today: string
  runMode: StandupRunMode
}

@Injectable()
export class StandupPipelineService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupRepository,
    private readonly notifications: WorkerEventPublisherService,
    private readonly generateStrategy: ExecuteGenerateStrategy,
    private readonly regenerateStrategy: ExecuteRegenerateStrategy,
    private readonly adjustStrategy: ExecuteAdjustStrategy,
  ) {
    this.logger = this.loggerFactory.create('standup-pipeline')
  }

  async execute(ctx: PipelineContext): Promise<Result<string | null, Error>> {
    const { options, runId, today, runMode } = ctx

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'queued',
      message: 'Geracao do standup iniciada',
    })

    const strategyResult = await this.runStrategy(runMode, ctx)
    if (strategyResult.isErr()) {
      return strategyResult
    }

    const generated = strategyResult.value

    if (generated === null) {
      await this.emitProgress({
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'no_activity',
        message: 'Nenhuma atividade encontrada hoje',
      })

      if (options.discordUserId.trim()) {
        this.notifications.notifyUserDm({
          discordUserId: options.discordUserId,
          title: '🔍 Nenhuma atividade encontrada',
          message:
            'Não encontrei commits hoje nos repositórios configurados. Verifique suas configurações.',
          color: 0xf39c12,
        })
      }

      return Result.ok(null)
    }

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'saving_draft',
      message: 'Salvando rascunho do standup',
    })

    const saveResult = await this.saveGeneratedStandup(options, {
      date: today,
      meetingType: generated.meetingType,
      content: generated.content,
      sourceData: generated.sourceData,
      replaceStandupId: generated.replaceStandupId,
    })

    if (saveResult.isErr()) {
      return saveResult
    }

    const standupId = saveResult.value.id
    this.logger.info('Standup draft saved', { standupId })

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'notifying_review',
      message: 'Enviando standup para revisao',
      standupId,
    })

    this.notifications.notifyStandupReady({
      standupId,
      discordUserId: options.discordUserId,
    })

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'completed',
      message: 'Standup pronto para revisao',
      standupId,
    })

    this.notifications.emitStandupGenerated({
      userId: options.userId,
      runId,
      standupId,
      date: today,
      mode: runMode,
    })

    return Result.ok(standupId)
  }

  private async runStrategy(mode: StandupRunMode, ctx: PipelineContext) {
    const executionInput = {
      options: ctx.options,
      today: ctx.today,
      reportProgress: this.createStrategyProgressReporter(
        ctx.options.userId,
        ctx.runId,
        ctx.today,
        ctx.runMode,
      ),
    }

    switch (mode) {
      case 'adjust':
        return this.adjustStrategy.execute(executionInput)
      case 'regenerate':
        return this.regenerateStrategy.execute(executionInput)
      default:
        return this.generateStrategy.execute(executionInput)
    }
  }

  private async saveGeneratedStandup(
    options: StandupJobOptions,
    input: {
      date: string
      meetingType: string
      content: string
      sourceData: string
      replaceStandupId?: string
    },
  ): Promise<Result<{ id: string }, DbError | NotFoundError>> {
    const replaceId = input.replaceStandupId ?? options.replaceStandupId?.trim()

    if (replaceId) {
      return this.standupRepository.replaceGeneratedForUser(
        replaceId,
        options.userId,
        {
          meetingType: input.meetingType,
          content: input.content,
          sourceData: input.sourceData,
        },
      )
    }

    return this.standupRepository.create({
      id: crypto.randomUUID(),
      date: input.date,
      meetingType: input.meetingType,
      content: input.content,
      sourceData: input.sourceData,
      userId: options.userId,
    })
  }

  private async emitProgress(event: {
    userId: string
    runId: string
    date: string
    mode: StandupRunMode
    step: StandupProgressStep
    message: string
    standupId?: string
  }) {
    this.notifications.emitStandupProgress({
      userId: event.userId,
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      step: event.step,
      message: event.message,
      ...(event.standupId ? { standupId: event.standupId } : {}),
    })
  }

  private createStrategyProgressReporter(
    userId: string,
    runId: string,
    date: string,
    mode: StandupRunMode,
  ) {
    return async ({ step, message }: StrategyProgressUpdate) =>
      this.emitProgress({
        userId,
        runId,
        date,
        mode,
        step,
        message,
      })
  }
}
