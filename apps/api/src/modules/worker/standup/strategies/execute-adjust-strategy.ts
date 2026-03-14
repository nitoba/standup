import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../../shared/module/database/repositories/standup.repository'
import { Result, ValidationError } from '../../../../shared/domain'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'

@Injectable()
export class ExecuteAdjustStrategy extends StandupStrategyBase {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly standupGenerator: StandupGeneratorService,
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

    const adjusted = await this.standupGenerator.generateAdjustedStandup(
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
