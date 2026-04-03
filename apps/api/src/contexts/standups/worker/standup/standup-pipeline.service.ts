import { Injectable } from '@nestjs/common'
import { StandupWriteRepository } from '../../../../platform/database/repositories/standup-write.repository'
import type {
  StandupProgressStep,
  StandupRunMode,
} from '../../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../../platform/logger'
import { DbError, NotFoundError, Result } from '../../../../shared/domain'
import { AgentSessionManager } from '../standup-agent/agent-session-manager'
import { WorkerEventPublisherService } from '../worker-event-publisher.service'
import { ExecuteAdjustStrategy } from './strategies/execute-adjust-strategy'
import { ExecuteGenerateStrategy } from './strategies/execute-generate-strategy'
import type { StandupJobOptions, StrategyProgressUpdate } from './types'

interface PipelineContext {
  options: StandupJobOptions
  runId: string
  todayIso: string
  todayDisplay: string
  runMode: StandupRunMode
}

@Injectable()
export class StandupPipelineService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupWriteRepository,
    private readonly notifications: WorkerEventPublisherService,
    private readonly generateStrategy: ExecuteGenerateStrategy,
    private readonly adjustStrategy: ExecuteAdjustStrategy,
    private readonly sessionManager: AgentSessionManager,
  ) {
    this.logger = this.loggerFactory.create('standup-pipeline')
  }

  async execute(ctx: PipelineContext): Promise<Result<string | null, Error>> {
    const { options, runId, todayIso, todayDisplay, runMode } = ctx

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: todayDisplay,
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
        date: todayDisplay,
        mode: runMode,
        step: 'no_activity',
        message: 'Nenhuma atividade encontrada hoje',
      })

      if (options.discordUserId.trim()) {
        const hasGit =
          options.selectedRepos.length > 0 &&
          options.gitAuthor.trim().length > 0
        const hasBoard = !!options.azureDevopsUser?.trim()
        let noActivityMessage: string
        if (hasGit && hasBoard) {
          noActivityMessage =
            'Não encontrei commits nem atividade no board hoje. Verifique suas configurações.'
        } else if (hasBoard) {
          noActivityMessage =
            'Não encontrei atividade no board do Azure DevOps hoje. Verifique suas configurações.'
        } else {
          noActivityMessage =
            'Não encontrei commits hoje nos repositórios configurados. Verifique suas configurações.'
        }

        this.notifications.notifyUserDm({
          discordUserId: options.discordUserId,
          title: '🔍 Nenhuma atividade encontrada',
          message: noActivityMessage,
          color: 0xf39c12,
        })
      }

      return Result.ok(null)
    }

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: todayDisplay,
      mode: runMode,
      step: 'saving_draft',
      message: 'Salvando rascunho do standup',
    })

    const saveResult = await this.saveGeneratedStandup(options, {
      date: todayIso,
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

    // Create agent session if agent instance was returned by strategy
    if (generated.agent) {
      this.sessionManager.create(standupId, generated.agent)
      this.logger.info('Agent session created', { standupId })
    }

    await this.emitProgress({
      userId: options.userId,
      runId,
      date: todayDisplay,
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
      date: todayDisplay,
      mode: runMode,
      step: 'completed',
      message: 'Standup pronto para revisao',
      standupId,
    })

    this.notifications.emitStandupGenerated({
      userId: options.userId,
      runId,
      standupId,
      date: todayDisplay,
      mode: runMode,
    })

    return Result.ok(standupId)
  }

  private async runStrategy(mode: StandupRunMode, ctx: PipelineContext) {
    const executionInput = {
      options: ctx.options,
      today: ctx.todayIso,
      reportProgress: this.createStrategyProgressReporter(
        ctx.options.userId,
        ctx.runId,
        ctx.todayDisplay,
        ctx.runMode,
      ),
    }

    switch (mode) {
      case 'adjust':
        return this.adjustStrategy.execute(executionInput)
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
    partialContent?: string
  }) {
    this.notifications.emitStandupProgress({
      userId: event.userId,
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      step: event.step,
      message: event.message,
      ...(event.standupId ? { standupId: event.standupId } : {}),
      ...(event.partialContent ? { partialContent: event.partialContent } : {}),
    })
  }

  private createStrategyProgressReporter(
    userId: string,
    runId: string,
    date: string,
    mode: StandupRunMode,
  ) {
    return async ({ step, message, partialContent }: StrategyProgressUpdate) =>
      this.emitProgress({
        userId,
        runId,
        date,
        mode,
        step,
        message,
        ...(partialContent ? { partialContent } : {}),
      })
  }
}
