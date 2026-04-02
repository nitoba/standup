import type { Agent } from '@mariozechner/pi-agent-core'
import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { AppLoggerFactory } from '../../../../../platform/logger'
import { AppTracingService } from '../../../../../platform/observability/app-tracing.service'
import { LocalDateService } from '../../../../../platform/time/local-date.service'
import type {
  GatheredBoardActivity,
  GatheredGitActivity,
} from '../../../../../shared/domain'
import { Result } from '../../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from '../../azure-devops/azure-devops-activity-collector.service'
import { GitCollectorService } from '../../git-collector/git-collector.service'
import { AgentSessionManager } from '../../standup-agent/agent-session-manager'
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import { WorkerRuntimeConfigService } from '../../worker-runtime-config.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'

@Injectable()
export class ExecuteGenerateStrategy extends StandupStrategyBase {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly gitCollector: GitCollectorService,
    private readonly boardCollector: AzureDevopsActivityCollectorService,
    private readonly standupGenerator: StandupGeneratorService,
    private readonly tracing: AppTracingService,
    private readonly standupReadRepo: StandupReadRepository,
    private readonly localDateService: LocalDateService,
    private readonly standupAgent: StandupAgentService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly sessionManager: AgentSessionManager,
  ) {
    super()
    this.logger = this.loggerFactory.create('generate-strategy')
  }

  private async computeSinceDate(
    userId: string,
    timezone: string,
  ): Promise<string> {
    // Calculate midnight in user's timezone
    const todayIso = this.localDateService.today(timezone).iso
    const midnightUtc = new Date(`${todayIso}T00:00:00`).toISOString()

    // Find last approved/published standup
    const lastApprovedResult =
      await this.standupReadRepo.findLastApprovedByUser(userId)

    if (lastApprovedResult.isErr() || !lastApprovedResult.value) {
      this.logger.debug('No previous approved standup found, using midnight', {
        userId,
        midnight: midnightUtc,
      })
      return midnightUtc
    }

    const lastCreatedAt = new Date(
      lastApprovedResult.value.createdAt,
    ).toISOString()

    // Use the more recent of midnight and last approved standup
    const sinceDate = lastCreatedAt > midnightUtc ? lastCreatedAt : midnightUtc

    this.logger.debug('Computed smart sinceDate', {
      userId,
      midnight: midnightUtc,
      lastApproved: lastCreatedAt,
      sinceDate,
    })

    return sinceDate
  }

  @Span('worker.standup.generate.execute')
  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, today, reportProgress } = input

    const sinceDate = await this.computeSinceDate(
      options.userId,
      options.timezone,
    )

    const hasGitSource =
      options.selectedRepos.length > 0 && options.gitAuthor.trim().length > 0
    const hasBoardSource = !!options.azureDevopsUser?.trim()

    let gitActivity: GatheredGitActivity | null = null
    let boardActivity: GatheredBoardActivity | null = null

    // --- Collect git activity ---
    if (hasGitSource) {
      await this.reportStage(
        reportProgress,
        'collecting_git',
        'Coletando commits dos repositorios',
      )

      const gitResult = await this.tracing.withSpan(
        'standup.git.collect',
        {
          'git.author': options.gitAuthor,
          'git.repos': options.selectedRepos.length,
        },
        () =>
          this.gitCollector.collect(
            options.selectedRepos,
            options.gitAuthor,
            sinceDate,
          ),
      )

      if (gitResult.isErr()) {
        if (hasBoardSource) {
          this.logger.warn(
            'Git collection failed, falling back to board only',
            {
              userId: options.userId,
              error: gitResult.error.message,
            },
          )
        } else {
          return gitResult
        }
      } else if (gitResult.value.repos.length > 0) {
        gitActivity = gitResult.value
      }
    }

    // --- Collect board activity ---
    if (hasBoardSource) {
      await this.reportStage(
        reportProgress,
        'collecting_board',
        'Coletando atividade do board Azure DevOps',
      )

      try {
        boardActivity = await this.tracing.withSpan(
          'standup.board.collect',
          { 'board.user': options.azureDevopsUser },
          () =>
            this.boardCollector.collect(
              // biome-ignore lint/style/noNonNullAssertion: checked via hasBoardSource
              options.azureDevopsUser!,
              sinceDate,
            ),
        )
      } catch (error) {
        if (gitActivity) {
          this.logger.warn(
            'Board collection failed, falling back to git only',
            {
              userId: options.userId,
              error: error instanceof Error ? error.message : String(error),
            },
          )
        } else {
          return Result.err(
            error instanceof Error
              ? error
              : new Error(`Board collection failed: ${String(error)}`),
          )
        }
      }
    }

    // --- No activity from either source ---
    if (!gitActivity && !boardActivity) {
      this.logger.info('No activity found from any source', {
        userId: options.userId,
      })
      return Result.ok(null)
    }

    // --- Generate standup ---
    const meetingType = this.standupGenerator.determineMeetingType(today)

    const usePiAgent = this.runtimeConfig.config.USE_PI_AGENT

    // Destroy old agent session on regenerate
    if (usePiAgent && options.replaceStandupId) {
      this.sessionManager.destroy(options.replaceStandupId)
    }

    const generated = usePiAgent
      ? await this.tracing.withSpan(
          'standup.agent.generate',
          { 'standup.meeting_type': meetingType, 'standup.mode': 'agent' },
          () =>
            this.standupAgent.generate({
              date: today,
              meetingType,
              gitActivity: gitActivity ?? undefined,
              boardActivity: boardActivity ?? undefined,
              extraContext: options.extraContext?.trim() || undefined,
              azureDevopsUuid: options.azureDevopsUuid,
              onStageChange: async (stage) => {
                await this.reportStage(
                  reportProgress,
                  stage === 'enriching_data'
                    ? 'enriching_data'
                    : 'generating_standup',
                  stage === 'enriching_data'
                    ? 'Enriquecendo contexto para o standup'
                    : 'Gerando texto do standup (PI Agent)',
                )
              },
              onContentDelta: (partialContent) => {
                this.reportStage(
                  reportProgress,
                  'streaming_content',
                  'Gerando conteudo...',
                  partialContent,
                )
              },
            }),
        )
      : await this.tracing.withSpan(
          'standup.llm.generate',
          { 'standup.meeting_type': meetingType, 'standup.mode': 'generate' },
          () =>
            this.standupGenerator.generateStandup(
              {
                date: today,
                meetingType,
                gitActivity: gitActivity ?? undefined,
                boardActivity: boardActivity ?? undefined,
                extraContext: options.extraContext?.trim() || undefined,
                azureDevopsUuid: options.azureDevopsUuid,
              },
              async (stage) => {
                if (stage === 'enriching_data') {
                  await this.reportStage(
                    reportProgress,
                    'enriching_data',
                    'Enriquecendo contexto para o standup',
                  )
                  return
                }

                await this.reportStage(
                  reportProgress,
                  'generating_standup',
                  'Gerando texto do standup',
                )
              },
            ),
        )

    if (generated.isErr()) {
      return generated
    }

    return Result.ok<GeneratedContent>({
      content: generated.value.content,
      meetingType,
      sourceData: JSON.stringify({ git: gitActivity, board: boardActivity }),
      // Pass agent for session creation in pipeline (only present when usePiAgent=true)
      ...('agent' in generated.value
        ? { agent: generated.value.agent as Agent }
        : {}),
    })
  }
}
