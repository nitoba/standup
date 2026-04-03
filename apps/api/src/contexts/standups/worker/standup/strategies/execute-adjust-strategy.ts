import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { Result, ValidationError } from '../../../../../shared/domain'
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
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
    private readonly standupAgent: StandupAgentService,
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

    const adjusted = await this.standupAgent.adjust({
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
      onContentDelta: (partialContent) => {
        this.reportStage(
          reportProgress,
          'streaming_content',
          'Ajustando conteudo...',
          partialContent,
        )
      },
    })

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
