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
    const standupRepository = this.standupRepository
    const standupAgent = this.standupAgent
    const reportStage = this.reportStage.bind(this)

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

    return Result.gen(async function* () {
      const baseStandup = yield* Result.await(
        standupRepository.findByIdForUser(baseStandupId, options.userId),
      )

      const adjusted = yield* Result.await(
        standupAgent.adjust({
          standupId: baseStandupId,
          instruction,
          previousContent: baseStandup.content,
          previousSummary: undefined,
          extraContext: options.extraContext?.trim() || undefined,
          onStageChange: async () => {
            await reportStage(
              reportProgress,
              'generating_standup',
              'Ajustando standup (PI Agent)',
            )
          },
          onContentDelta: (partialContent) => {
            reportStage(
              reportProgress,
              'streaming_content',
              'Ajustando conteudo...',
              partialContent,
            )
          },
        }),
      )

      return Result.ok<GeneratedContent>({
        content: adjusted.content,
        meetingType: baseStandup.meetingType,
        sourceData: baseStandup.sourceData,
        replaceStandupId: options.replaceStandupId?.trim() || baseStandupId,
      })
    })
  }
}
