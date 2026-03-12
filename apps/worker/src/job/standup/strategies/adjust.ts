import type { WorkerEnv } from '@standup/config'
import { Result, ValidationError } from '@standup/domain'
import {
  type AzureMcpClient,
  generateAdjustedStandup,
} from '@standup/standup-generator'
import type {
  GeneratedContent,
  StrategyContext,
  StrategyResult,
} from '../types.js'

/**
 * Adjust strategy — rewrites an existing standup following a user instruction.
 *
 * Responsibilities:
 *  - Validate that rewriteFromStandupId is present
 *  - Load the base standup from the DB
 *  - Call generateAdjustedStandup
 *  - Return the adjusted content
 */
export async function executeAdjustStrategy(
  ctx: StrategyContext,
): Promise<StrategyResult> {
  const { options, standupRepo, env, reportProgress } = ctx

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
        message:
          'rewriteFromStandupId is required when rewriteInstruction is provided',
      }),
    )
  }

  const baseResult = await standupRepo.findByIdForUser(
    baseStandupId,
    options.userId,
  )
  if (baseResult.isErr()) return baseResult

  const base = baseResult.value
  const generatorConfig = buildGeneratorConfig(
    env,
    ctx.mcpClient,
    reportProgress,
  )

  const adjusted = await generateAdjustedStandup(
    {
      previousContent: base.content,
      instruction,
      extraContext: options.extraContext?.trim() || undefined,
    },
    generatorConfig,
  )

  if (adjusted.isErr()) return adjusted

  const replaceStandupId = options.replaceStandupId?.trim() || baseStandupId

  return Result.ok<GeneratedContent>({
    content: adjusted.value.content,
    meetingType: base.meetingType,
    sourceData: base.sourceData,
    replaceStandupId,
  })
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
    onStageChange: async () => {
      await reportProgress?.({
        step: 'generating_standup',
        message: 'Gerando standup ajustado',
      })
    },
  }
}
