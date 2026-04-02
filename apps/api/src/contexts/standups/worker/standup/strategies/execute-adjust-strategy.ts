import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { Result, ValidationError } from '../../../../../shared/domain'
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
export class ExecuteAdjustStrategy extends StandupStrategyBase {
  constructor(
    private readonly standupRepository: StandupReadRepository,
    private readonly standupGenerator: StandupGeneratorService,
    private readonly standupAgent: StandupAgentService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    super()
  }

  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, reportProgress } = input
    const instruction = options.rewriteInstruction?.trim()
    const baseStandupId = options.rewriteFromStandupId?.trim()

    if (!instruction) {
      return Result.err(
        new ValidationError({
          field: 'rewriteInstruction',
          message: 'rewriteInstruction is required for adjust mode',
        }),
      )
    }

    if (!baseStandupId) {
      return Result.err(
        new ValidationError({
          field: 'rewriteFromStandupId',
          message: 'rewriteFromStandupId is required for adjust mode',
        }),
      )
    }

    const baseResult = await this.standupRepository.findByIdForUser(
      baseStandupId,
      options.userId,
    )
    if (baseResult.isErr()) {
      return baseResult
    }

    const usePiAgent = this.runtimeConfig.config.USE_PI_AGENT

    const adjusted = usePiAgent
      ? await this.standupAgent.adjust({
          standupId: baseStandupId,
          instruction,
          previousContent: baseResult.value.content,
          previousSummary: undefined,
          extraContext: options.extraContext?.trim() || undefined,
          onStageChange: async () => {
            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Ajustando standup (PI Agent)',
            )
          },
        })
      : await this.standupGenerator.generateAdjustedStandup(
          {
            previousContent: baseResult.value.content,
            instruction,
            extraContext: options.extraContext?.trim() || undefined,
          },
          async () => {
            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Gerando standup ajustado',
            )
          },
        )

    if (adjusted.isErr()) {
      return adjusted
    }

    return Result.ok<GeneratedContent>({
      content: adjusted.value.content,
      meetingType: baseResult.value.meetingType,
      sourceData: baseResult.value.sourceData,
      replaceStandupId: options.replaceStandupId?.trim() || baseStandupId,
    })
  }
}
