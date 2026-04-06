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
    const standupRepository = this.standupRepository
    const standupAgent = this.standupAgent
    const reportStage = this.reportStage.bind(this)

    if (!replaceStandupId) {
      return Result.err(
        new ValidationError({
          field: 'replaceStandupId',
          message: 'replaceStandupId is required for regenerate mode',
        }),
      )
    }

    return Result.gen(async function* () {
      const existing = yield* Result.await(
        standupRepository.findByIdForUser(replaceStandupId, options.userId),
      )

      const sourceData = yield* parseSourceData(existing.sourceData)

      const regenerated = yield* Result.await(
        standupAgent.generate({
          date: today,
          meetingType: existing.meetingType,
          gitActivity: sourceData.git ?? undefined,
          boardActivity: sourceData.board ?? undefined,
          extraContext: options.extraContext?.trim() || undefined,
          onStageChange: async (stage) => {
            if (stage === 'enriching_data') {
              await reportStage(
                reportProgress,
                'enriching_data',
                'Enriquecendo contexto para o standup',
              )
              return
            }

            await reportStage(
              reportProgress,
              'generating_standup',
              'Gerando standup a partir da base existente',
            )
          },
        }),
      )

      return Result.ok<GeneratedContent>({
        content: regenerated.content,
        meetingType: existing.meetingType,
        sourceData: existing.sourceData,
        replaceStandupId,
      })
    })
  }
}
