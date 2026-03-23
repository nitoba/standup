import { Injectable } from '@nestjs/common'
import { generateText, Output } from 'ai'
import type { LanguageModel } from 'ai'
import * as z from 'zod'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GatheredGitActivity,
  GeneratedStandup,
  GenerateStandupInput,
  StandupRecord,
} from '../../../../shared/domain'
import {
  AllProvidersUnavailableError,
  ExternalServiceError,
  Result,
} from '../../../../shared/domain'
import { AzureDevopsEnrichmentService } from '../azure-devops/azure-devops-enrichment.service'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { ModelSelection } from './llm-provider-registry'
import { LlmProviderRegistry } from './llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from './standup-prompt.service'

const standupOutputSchema = z.object({
  content: z.string(),
  summary: z.string(),
})

type StandupOutput = z.infer<typeof standupOutputSchema>

type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface AdjustStandupInput {
  previousContent: string
  instruction: string
  extraContext?: string
}

@Injectable()
export class StandupGeneratorService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly azureDevopsEnrichment: AzureDevopsEnrichmentService,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
  ) {
    this.logger = this.loggerFactory.create('standup-generator')
  }

  async generateStandup(
    input: GenerateStandupInput,
    onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    return Result.gen(
      async function* (this: StandupGeneratorService) {
        let enrichedActivity: EnrichedGitActivity | undefined
        if (input.gitActivity) {
          await onStageChange?.('enriching_data')
          enrichedActivity = await this.enrichWithFallback(
            input.gitActivity,
            input.azureDevopsUuid,
          )
        }

        await onStageChange?.('generating_standup')
        const systemPrompt = this.standupPrompt.buildSystemPrompt({
          hasGit: !!input.gitActivity,
          hasBoard: !!input.boardActivity,
        })

        let generated = yield* Result.await(
          this.callWithFallback(
            (model) =>
              this.runObjectGeneration(
                model,
                systemPrompt,
                this.standupPrompt.buildUserMessage(input, enrichedActivity),
              ),
            'LLM standup generation',
          ),
        )

        if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
          generated = yield* Result.await(
            this.callWithFallback(
              (model) =>
                this.runObjectGeneration(
                  model,
                  systemPrompt,
                  this.standupPrompt.buildRewriteUserMessage(
                    generated.content,
                    generated.summary,
                  ),
                ),
              'LLM standup rewrite',
            ),
          )
        }

        if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
          yield* Result.err(
            new ExternalServiceError({
              service: 'ai-provider',
              message: `Standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${generated.content.length})`,
            }),
          )
        }

        return Result.ok({
          content: generated.content,
          summary: generated.summary,
        })
      }.bind(this),
    )
  }

  async generateAdjustedStandup(
    input: AdjustStandupInput,
    onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    return Result.gen(
      async function* (this: StandupGeneratorService) {
        if (!input.previousContent.trim()) {
          yield* Result.err(
            new ExternalServiceError({
              service: 'ai-provider',
              message: 'Cannot adjust standup without previous content',
            }),
          )
        }

        if (!input.instruction.trim()) {
          yield* Result.err(
            new ExternalServiceError({
              service: 'ai-provider',
              message: 'Cannot adjust standup without user instruction',
            }),
          )
        }

        await onStageChange?.('generating_standup')
        const systemPrompt = this.standupPrompt.buildSystemPrompt({
          hasGit: true,
          hasBoard: false,
        })

        let adjusted = yield* Result.await(
          this.callWithFallback(
            (model) =>
              this.runObjectGeneration(
                model,
                systemPrompt,
                this.standupPrompt.buildAdjustUserMessage(
                  input.previousContent,
                  input.instruction,
                  input.extraContext,
                ),
              ),
            'LLM adjust',
          ),
        )

        if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
          adjusted = yield* Result.await(
            this.callWithFallback(
              (model) =>
                this.runObjectGeneration(
                  model,
                  systemPrompt,
                  this.standupPrompt.buildRewriteUserMessage(
                    adjusted.content,
                    adjusted.summary,
                  ),
                ),
              'LLM rewrite after adjust',
            ),
          )
        }

        if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
          yield* Result.err(
            new ExternalServiceError({
              service: 'ai-provider',
              message: `Adjusted standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${adjusted.content.length})`,
            }),
          )
        }

        return Result.ok({
          content: adjusted.content,
          summary: adjusted.summary,
        })
      }.bind(this),
    )
  }

  async generateWeeklyInsights(
    standups: StandupRecord[],
  ): Promise<
    Result<string, ExternalServiceError | AllProvidersUnavailableError>
  > {
    if (standups.length === 0) {
      return Result.err(
        new ExternalServiceError({
          service: 'ai-provider',
          message: 'No standups provided for weekly insights generation',
        }),
      )
    }

    return this.callWithFallback(
      (model) =>
        this.runTextGeneration(
          model,
          this.standupPrompt.buildWeeklyInsightsSystemPrompt(),
          this.standupPrompt.buildWeeklyInsightsUserMessage(standups),
        ),
      'Weekly insights generation',
    )
  }

  determineMeetingType(dateString: string): string {
    return this.standupPrompt.determineMeetingType(dateString)
  }

  private async enrichWithFallback(
    gitActivity: GatheredGitActivity,
    azureDevopsUuid?: string,
  ): Promise<EnrichedGitActivity> {
    const enrichmentResult = await this.withSimpleRetry(
      () =>
        this.azureDevopsEnrichment.enrichGitActivity(
          gitActivity,
          azureDevopsUuid,
        ),
      'Azure DevOps enrichment',
      2,
      3_000,
    )

    if (enrichmentResult.isOk()) {
      return enrichmentResult.value
    }

    return {
      timestamp: gitActivity.timestamp,
      userUuid: azureDevopsUuid ?? 'unknown',
      repos: gitActivity.repos.map((repo) => ({
        ...repo,
        enrichedItems: [],
      })),
    }
  }

  private async withSimpleRetry<T>(
    fn: () => Promise<Result<T, ExternalServiceError>>,
    label: string,
    maxAttempts: number,
    baseDelayMs: number,
  ): Promise<Result<T, ExternalServiceError>> {
    let lastResult: Result<T, ExternalServiceError> | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResult = await fn()

      if (lastResult.isOk()) {
        return lastResult
      }

      this.logger.warn(`${label} failed`, {
        attempt,
        maxAttempts,
        error: lastResult.error.message,
      })

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
        )
      }
    }

    // biome-ignore lint/style/noNonNullAssertion: set inside loop
    return lastResult!
  }

  private async runObjectGeneration(
    model: LanguageModel,
    system: string,
    prompt: string,
  ): Promise<StandupOutput> {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: standupOutputSchema }),
      system,
      prompt,
    })

    if (!output) {
      throw new Error('LLM returned no structured output')
    }

    return output
  }

  private async runTextGeneration(
    model: LanguageModel,
    system: string,
    prompt: string,
  ): Promise<string> {
    const { text } = await generateText({
      model,
      system,
      prompt,
    })

    return text
  }

  private async callWithFallback<T>(
    fn: (model: LanguageModel) => Promise<T>,
    errorContext: string,
  ): Promise<
    Result<T, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown
    let previousModelKey: string | undefined

    for (let i = 0; i < totalModels; i++) {
      let selection: ModelSelection
      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const { model, modelKey, provider, tier } = selection
      const maxRetries = 2
      const baseDelay = 1_000

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.logger.info('Calling LLM', {
            model: modelKey,
            provider,
            tier,
            attempt,
            fallbackFrom: previousModelKey,
          })

          const result = await fn(model)
          this.llmRegistry.reportSuccess(modelKey)
          return Result.ok(result)
        } catch (error) {
          lastError = error

          if (this.isRateLimitError(error)) {
            this.llmRegistry.reportFailure(modelKey, error)
            this.logger.warn('Rate limited, falling back to next model', {
              model: modelKey,
              provider,
              tier,
              attempt,
            })
            break
          }

          this.logger.warn(`${errorContext} failed`, {
            model: modelKey,
            provider,
            tier,
            attempt,
            maxRetries,
            error:
              error instanceof Error ? error.message : String(error),
          })

          if (attempt < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, baseDelay * 2 ** (attempt - 1)),
            )
          }
        }
      }

      previousModelKey = modelKey
    }

    return Result.err(
      new AllProvidersUnavailableError({
        message: `${errorContext}: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
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
