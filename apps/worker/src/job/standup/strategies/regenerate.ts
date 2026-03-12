import type { WorkerEnv } from '@standup/config'
import {
  GenerateStandupInputSchema,
  Result,
  ValidationError,
} from '@standup/domain'
import {
  type AzureMcpClient,
  generateStandup,
} from '@standup/standup-generator'
import type {
  GeneratedContent,
  StrategyContext,
  StrategyResult,
} from '../types.js'

/**
 * Regenerate strategy — re-generates the standup text from the already-stored
 * git activity, avoiding a new git collection pass.
 *
 * Responsibilities:
 *  - Validate that replaceStandupId is present
 *  - Load the existing standup and parse its sourceData
 *  - Call generateStandup with the stored git activity
 *  - Return the regenerated content
 */
export async function executeRegenerateStrategy(
  ctx: StrategyContext,
): Promise<StrategyResult> {
  const { options, today, standupRepo, env, reportProgress } = ctx

  const replaceStandupId = options.replaceStandupId?.trim()
  if (!replaceStandupId) {
    return Result.err(
      new ValidationError({
        field: 'replaceStandupId',
        message:
          'replaceStandupId is required when reuseExistingSource is true',
      }),
    )
  }

  const existingResult = await standupRepo.findByIdForUser(
    replaceStandupId,
    options.userId,
  )
  if (existingResult.isErr()) return existingResult

  const existing = existingResult.value
  const gitActivityResult = parseStoredGitActivity(existing.sourceData)
  if (gitActivityResult.isErr()) return gitActivityResult

  const generatorConfig = buildGeneratorConfig(
    env,
    ctx.mcpClient,
    reportProgress,
  )

  const regenerated = await generateStandup(
    {
      date: today,
      meetingType: existing.meetingType,
      gitActivity: gitActivityResult.value,
      extraContext: options.extraContext?.trim() || undefined,
    },
    generatorConfig,
  )

  if (regenerated.isErr()) return regenerated

  return Result.ok<GeneratedContent>({
    content: regenerated.value.content,
    meetingType: existing.meetingType,
    sourceData: existing.sourceData,
    replaceStandupId,
  })
}

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

function buildGeneratorConfig(
  env: WorkerEnv,
  mcpClient?: AzureMcpClient,
  reportProgress?: StrategyContext['reportProgress'],
) {
  return {
    aiProviderApiKey: env.AI_PROVIDER_API_KEY,
    azure: {
      orgUrl: `https://dev.azure.com/${env.AZURE_DEVOPS_ORG}`,
      defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
      pat: env.AZURE_DEVOPS_PAT,
    },
    mcpClient,
    onStageChange: async (stage: 'enriching_data' | 'generating_standup') => {
      if (stage === 'enriching_data') {
        await reportProgress?.({
          step: 'enriching_data',
          message: 'Enriquecendo contexto para o standup',
        })
        return
      }

      await reportProgress?.({
        step: 'generating_standup',
        message: 'Gerando standup a partir da base existente',
      })
    },
  }
}
