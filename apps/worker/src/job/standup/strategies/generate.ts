import type { WorkerEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { collectGitActivity } from '@standup/git-collector'
import { createServiceLogger } from '@standup/logger'
import { withSpan } from '@standup/observability'
import {
  type AzureMcpClient,
  determineMeetingType,
  generateStandup,
} from '@standup/standup-generator'
import type {
  GeneratedContent,
  StrategyContext,
  StrategyResult,
} from '../types.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'generate-strategy',
})

/**
 * Generate strategy — collects fresh git activity and generates a new standup.
 *
 * Responsibilities:
 *  - Collect git commits from the selected repos
 *  - Return null if no activity is found (caller handles the no-activity path)
 *  - Call generateStandup with fresh data
 *  - Return the generated content
 */
export async function executeGenerateStrategy(
  ctx: StrategyContext,
): Promise<StrategyResult> {
  const { options, today, env, reportProgress } = ctx

  await reportProgress?.({
    step: 'collecting_git',
    message: 'Coletando commits dos repositorios',
  })

  const gitActivity = await withSpan(
    'standup.git.collect',
    {
      'git.author': options.gitAuthor,
      'git.repos': options.selectedRepos.length,
    },
    () =>
      collectGitActivity({
        reposRootPath: options.reposRootPath,
        selectedRepos: options.selectedRepos,
        author: options.gitAuthor,
        sincePeriod: options.gitSincePeriod ?? '8 hours ago',
      }),
  )

  if (gitActivity.isErr()) return gitActivity

  if (gitActivity.value.repos.length === 0) {
    logger.info('No commits found today — skipping standup generation', {
      userId: options.userId,
    })
    // Returning null signals the pipeline to emit a no_activity event
    return Result.ok(null)
  }

  const meetingType = determineMeetingType(today)
  const generatorConfig = buildGeneratorConfig(env, ctx.mcpClient, reportProgress)

  const generated = await withSpan(
    'standup.llm.generate',
    { 'standup.meeting_type': meetingType, 'standup.mode': ctx.runMode },
    () =>
      generateStandup(
        {
          date: today,
          meetingType,
          gitActivity: gitActivity.value,
          extraContext: options.extraContext?.trim() || undefined,
        },
        generatorConfig,
      ),
  )

  if (generated.isErr()) return generated

  return Result.ok<GeneratedContent>({
    content: generated.value.content,
    meetingType,
    sourceData: JSON.stringify(gitActivity.value),
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
        message: 'Gerando texto do standup',
      })
    },
  }
}
