import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import {
  parseSourceData,
  Result,
  ValidationError,
} from '../../../../../shared/domain'
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'

@Injectable()
export class ExecuteRegenerateStrategy extends StandupStrategyBase {
  constructor(
    private readonly standupRepository: StandupReadRepository,
    private readonly standupAgent: StandupAgentService,
  ) {
    super()
  }

  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, today, reportProgress } = input
    const replaceStandupId = options.replaceStandupId?.trim()

    if (!replaceStandupId) {
      return Result.err(
        new ValidationError({
          field: 'replaceStandupId',
          message: 'replaceStandupId is required for regenerate mode',
        }),
      )
    }

    const existingResult = await this.standupRepository.findByIdForUser(
      replaceStandupId,
      options.userId,
    )
    if (existingResult.isErr()) {
      return existingResult
    }

    const sourceData = parseSourceData(existingResult.value.sourceData)
    if (sourceData.isErr()) {
      return sourceData
    }

    const regenerated = await this.standupAgent.generate({
      date: today,
      meetingType: existingResult.value.meetingType,
      gitActivity: sourceData.value.git ?? undefined,
      boardActivity: sourceData.value.board ?? undefined,
      extraContext: options.extraContext?.trim() || undefined,
      onStageChange: async (stage) => {
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
          'Gerando standup a partir da base existente',
        )
      },
    })

    if (regenerated.isErr()) {
      return regenerated
    }

    return Result.ok<GeneratedContent>({
      content: regenerated.value.content,
      meetingType: existingResult.value.meetingType,
      sourceData: existingResult.value.sourceData,
      replaceStandupId,
    })
  }
}
