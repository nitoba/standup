import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../../shared/module/database/repositories/standup.repository'
import {
  GenerateStandupInputSchema,
  Result,
  ValidationError,
} from '../../../../shared/domain'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'

function parseStoredGitActivity(sourceData: string) {
  try {
    const parsed = JSON.parse(sourceData) as unknown
    const validated =
      GenerateStandupInputSchema.shape.gitActivity.safeParse(parsed)

    if (!validated.success) {
      return Result.err(
        new ValidationError({
          field: 'sourceData',
          message: 'Stored sourceData is invalid and cannot be reused',
        }),
      )
    }

    return Result.ok(validated.data)
  } catch {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'Stored sourceData is not valid JSON',
      }),
    )
  }
}

@Injectable()
export class ExecuteRegenerateStrategy extends StandupStrategyBase {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly standupGenerator: StandupGeneratorService,
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

    const gitActivityResult = parseStoredGitActivity(
      existingResult.value.sourceData,
    )
    if (gitActivityResult.isErr()) {
      return gitActivityResult
    }

    const regenerated = await this.standupGenerator.generateStandup(
      {
        date: today,
        meetingType: existingResult.value.meetingType,
        gitActivity: gitActivityResult.value,
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
          'Gerando standup a partir da base existente',
        )
      },
    )

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
