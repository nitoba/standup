import { Injectable } from '@nestjs/common'
import { Agent } from '@mariozechner/pi-agent-core'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GeneratedStandup,
  GenerateStandupInput,
} from '../../../../shared/domain'
import {
  AllProvidersUnavailableError,
  ExternalServiceError,
  Result,
} from '../../../../shared/domain'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { LlmProviderRegistry } from '../standup-generator/llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from '../standup-generator/standup-prompt.service'
import { toPiAiModel } from './pi-ai-model-adapter'
import {
  extractSubmitStandupResult,
  submitStandupTool,
} from './submit-standup.tool'

type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface AgentGenerateInput {
  date: string
  meetingType: string
  gitActivity?: GenerateStandupInput['gitActivity']
  boardActivity?: GenerateStandupInput['boardActivity']
  enrichedActivity?: EnrichedGitActivity
  extraContext?: string
  azureDevopsUuid?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
}

const AGENT_TIMEOUT_MS = 60_000

@Injectable()
export class StandupAgentService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
  ) {
    this.logger = this.loggerFactory.create('standup-agent')
  }

  async generate(
    input: AgentGenerateInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    await input.onStageChange?.('generating_standup')

    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: !!input.gitActivity,
      hasBoard: !!input.boardActivity,
    })

    const userMessage = this.standupPrompt.buildUserMessage(
      {
        date: input.date,
        meetingType: input.meetingType,
        gitActivity: input.gitActivity,
        boardActivity: input.boardActivity,
        extraContext: input.extraContext,
        azureDevopsUuid: input.azureDevopsUuid,
      },
      input.enrichedActivity,
    )

    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown

    // Single attempt per model (no inner retry). Agent calls create stateful sessions
    // which are more expensive than one-shot generateText. Retry at the model level
    // (via the outer loop) is sufficient for Phase 1.
    for (let i = 0; i < totalModels; i++) {
      let selection: ReturnType<LlmProviderRegistry['getNextModel']>
      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const { modelKey, provider, tier } = selection

      try {
        this.logger.info('Calling PI Agent', {
          model: modelKey,
          provider,
          tier,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [submitStandupTool],
            messages: [],
          },
        })

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          agent.prompt(userMessage),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('Agent prompt timed out')),
              AGENT_TIMEOUT_MS,
            )
          }),
        ]).finally(() => clearTimeout(timeoutHandle))

        const result = extractSubmitStandupResult(agent.state.messages)
        if (!result) {
          this.logger.warn('Agent did not call submit_standup tool', {
            model: modelKey,
            provider,
          })
          lastError = new Error('Agent did not call submit_standup tool')
          continue
        }

        // Rewrite if content too long
        if (result.content.length > MAX_STANDUP_CONTENT_CHARS) {
          this.logger.info('Content exceeds limit, requesting rewrite', {
            model: modelKey,
            length: result.content.length,
            limit: MAX_STANDUP_CONTENT_CHARS,
          })

          let rewriteTimeoutHandle: ReturnType<typeof setTimeout> | undefined
          await Promise.race([
            agent.prompt(
              this.standupPrompt.buildRewriteUserMessage(
                result.content,
                result.summary,
              ),
            ),
            new Promise<never>((_, reject) => {
              rewriteTimeoutHandle = setTimeout(
                () => reject(new Error('Agent rewrite timed out')),
                AGENT_TIMEOUT_MS,
              )
            }),
          ]).finally(() => clearTimeout(rewriteTimeoutHandle))

          const rewriteResult = extractSubmitStandupResult(
            agent.state.messages,
          )
          if (rewriteResult) {
            this.llmRegistry.reportSuccess(modelKey)
            return Result.ok({
              content: rewriteResult.content.slice(
                0,
                MAX_STANDUP_CONTENT_CHARS,
              ),
              summary: rewriteResult.summary,
            })
          }
        }

        this.llmRegistry.reportSuccess(modelKey)
        return Result.ok({
          content:
            result.content.length > MAX_STANDUP_CONTENT_CHARS
              ? result.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
              : result.content,
          summary: result.summary,
        })
      } catch (error) {
        lastError = error
        this.logger.warn('PI Agent generation failed', {
          model: modelKey,
          provider,
          tier,
          error: error instanceof Error ? error.message : String(error),
        })

        if (this.isRateLimitError(error)) {
          this.llmRegistry.reportFailure(modelKey, error)
        }
      }
    }

    return Result.err(
      new AllProvidersUnavailableError({
        message: `PI Agent standup generation: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
    )
  }

  private isRateLimitError(error: unknown): boolean {
    if (
      error != null &&
      typeof error === 'object' &&
      'statusCode' in error &&
      (error as { statusCode: number }).statusCode === 429
    ) {
      return true
    }
    if (
      error != null &&
      typeof error === 'object' &&
      'cause' in error &&
      (error as { cause: { status?: number } }).cause?.status === 429
    ) {
      return true
    }
    if (error instanceof Error && /rate.?limit/i.test(error.message)) {
      return true
    }
    return false
  }
}
