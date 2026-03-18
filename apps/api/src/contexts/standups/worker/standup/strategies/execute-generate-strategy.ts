import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { AppLoggerFactory } from '../../../../../platform/logger'
import { AppTracingService } from '../../../../../platform/observability/app-tracing.service'
import type {
  GatheredBoardActivity,
  GatheredGitActivity,
} from '../../../../../shared/domain'
import { Result } from '../../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from '../../azure-devops/azure-devops-activity-collector.service'
import { GitCollectorService } from '../../git-collector/git-collector.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
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
  ) {
    super()
    this.logger = this.loggerFactory.create('generate-strategy')
  }

  @Span('worker.standup.generate.execute')
  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, today, reportProgress } = input

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
            options.gitSincePeriod ?? '8 hours ago',
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
              options.gitSincePeriod ?? '8 hours ago',
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
    const generated = await this.tracing.withSpan(
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
    })
  }
}
