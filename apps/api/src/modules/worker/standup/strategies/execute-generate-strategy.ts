import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { Result } from '../../../../shared/domain'
import { AppLoggerFactory } from '../../../../shared/module/logger'
import { AppTracingService } from '../../../../shared/module/observability/app-tracing.service'
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
    private readonly standupGenerator: StandupGeneratorService,
    private readonly tracing: AppTracingService,
  ) {
    super()
    this.logger = this.loggerFactory.create('generate-strategy')
  }

  @Span('worker.standup.generate.execute')
  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, today, reportProgress } = input

    await this.reportStage(
      reportProgress,
      'collecting_git',
      'Coletando commits dos repositorios',
    )

    const gitActivity = await this.tracing.withSpan(
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

    if (gitActivity.isErr()) {
      return gitActivity
    }

    if (gitActivity.value.repos.length === 0) {
      this.logger.info('No commits found today', { userId: options.userId })
      return Result.ok(null)
    }

    const meetingType = this.standupGenerator.determineMeetingType(today)
    const generated = await this.tracing.withSpan(
      'standup.llm.generate',
      { 'standup.meeting_type': meetingType, 'standup.mode': 'generate' },
      () =>
        this.standupGenerator.generateStandup(
          {
            date: today,
            meetingType,
            gitActivity: gitActivity.value,
            extraContext: options.extraContext?.trim() || undefined,
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
      sourceData: JSON.stringify(gitActivity.value),
    })
  }
}
