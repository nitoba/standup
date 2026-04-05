import type { Agent } from '@mastra/core/agent'
import type { Memory } from '@mastra/memory'
import { Inject, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupStatusChangedEvent,
} from '../../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GeneratedStandup,
  GenerateStandupInput,
  StandupRecord,
} from '../../../../shared/domain'
import {
  AllProvidersUnavailableError,
  ExternalServiceError,
  Result,
} from '../../../../shared/domain'
import type { EnrichedGitActivity } from '../azure-devops/types'
import type { ModelSelection } from '../standup-generator/llm-provider-registry'
import { LlmProviderRegistry } from '../standup-generator/llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from '../standup-generator/standup-prompt.service'
import { MASTRA_MEMORY, MASTRA_STANDUP_AGENT } from './mastra/mastra.provider'
import { standupOutputSchema } from './mastra/standup-output.schema'

export type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface AgentGenerateInput {
  date: string
  meetingType: string
  gitActivity?: GenerateStandupInput['gitActivity']
  boardActivity?: GenerateStandupInput['boardActivity']
  enrichedActivity?: EnrichedGitActivity
  extraContext?: string
  azureDevopsUuid?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
  onContentDelta?: (partialContent: string) => void
}

export interface AgentAdjustInput {
  standupId: string
  instruction: string
  previousContent: string
  previousSummary?: string
  extraContext?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
  onContentDelta?: (partialContent: string) => void
}

const AGENT_TIMEOUT_MS = 60_000

@Injectable()
export class StandupAgentService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
    @Inject(MASTRA_STANDUP_AGENT) private readonly agent: Agent,
    @Inject(MASTRA_MEMORY) private readonly memory: Memory,
  ) {
    this.logger = this.loggerFactory.create('standup-agent')
  }

  @OnEvent(STANDUP_STATUS_CHANGED_EVENT)
  async handleStandupStatusChanged(
    event: StandupStatusChangedEvent,
  ): Promise<void> {
    if (event.newStatus !== 'approved' && event.newStatus !== 'published') {
      return
    }

    const threadId = `standup-${event.standupId}`
    try {
      await this.memory.deleteThread(threadId)
      this.logger.info('Memory thread cleaned up after approval', {
        standupId: event.standupId,
        threadId,
      })
    } catch (error) {
      // Non-fatal: thread may not exist (e.g., no adjust was done)
      this.logger.warn('Failed to clean up memory thread', {
        standupId: event.standupId,
        threadId,
        error: String(error),
      })
    }
  }

  async generate(
    input: AgentGenerateInput,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
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

    return this.callWithModelFallback(async (modelString) => {
      const options = {
        instructions: systemPrompt,
        model: modelString,
        structuredOutput: { schema: standupOutputSchema },
        providerOptions: {
          google: { structuredOutputs: true },
        },
        memory: {
          resource: `user-${input.azureDevopsUuid ?? 'default'}`,
          thread: `standup-generate-${input.date}`,
        },
      }

      // Try streaming for content deltas
      if (input.onContentDelta) {
        try {
          const stream = await this.agent.stream(userMessage, options)
          let hasChunks = false

          for await (const chunk of stream.textStream) {
            hasChunks = true
            input.onContentDelta(chunk)
          }

          if (hasChunks) {
            const result = await stream.object
            if (result) {
              return this.validateAndRewrite(
                result,
                modelString,
                systemPrompt,
              )
            }
          }
        } catch (streamError) {
          this.logger.warn('Streaming failed, falling back to generate', {
            error: String(streamError),
          })
        }
      }

      // Fallback: non-streaming generate
      const response = await this.agent.generate(userMessage, options)
      const object = response.object as {
        content: string
        summary: string
      }
      return this.validateAndRewrite(object, modelString, systemPrompt)
    })
  }

  async adjust(
    input: AgentAdjustInput,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    await input.onStageChange?.('generating_standup')

    const adjustMessage = this.standupPrompt.buildAdjustUserMessage(
      input.previousContent,
      input.instruction,
      input.extraContext,
    )

    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: true,
      hasBoard: false,
    })

    return this.callWithModelFallback(async (modelString) => {
      const response = await this.agent.generate(adjustMessage, {
        instructions: systemPrompt,
        model: modelString,
        structuredOutput: { schema: standupOutputSchema },
        providerOptions: {
          google: { structuredOutputs: true },
        },
        memory: {
          resource: 'user-default',
          thread: `standup-${input.standupId}`,
        },
      })

      const object = response.object as {
        content: string
        summary: string
      }

      return {
        content:
          object.content.length > MAX_STANDUP_CONTENT_CHARS
            ? object.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
            : object.content,
        summary: object.summary ?? '',
      }
    })
  }

  async generateWeeklyInsights(
    standups: StandupRecord[],
  ): Promise<
    Result<string, ExternalServiceError | AllProvidersUnavailableError>
  > {
    if (standups.length === 0) {
      return Result.err(
        new ExternalServiceError({
          service: 'llm',
          message: 'No standups provided for weekly insights generation',
        }),
      )
    }

    const systemPrompt = this.standupPrompt.buildWeeklyInsightsSystemPrompt()
    const userMessage =
      this.standupPrompt.buildWeeklyInsightsUserMessage(standups)

    return this.callWithModelFallback(async (modelString) => {
      const response = await this.agent.generate(userMessage, {
        instructions: systemPrompt,
        model: modelString,
      })

      return response.text
    })
  }

  // --- Private helpers ---

  private async validateAndRewrite(
    output: { content: string; summary: string },
    modelString: string,
    systemPrompt: string,
  ): Promise<GeneratedStandup> {
    let { content, summary } = output

    if (content.length > MAX_STANDUP_CONTENT_CHARS) {
      this.logger.info('Content exceeds limit, requesting rewrite', {
        length: content.length,
        limit: MAX_STANDUP_CONTENT_CHARS,
      })

      const rewriteMessage = this.standupPrompt.buildRewriteUserMessage(
        content,
        summary,
      )

      const rewriteResponse = await this.agent.generate(rewriteMessage, {
        instructions: systemPrompt,
        model: modelString,
        structuredOutput: { schema: standupOutputSchema },
        providerOptions: {
          google: { structuredOutputs: true },
        },
      })

      const rewriteObject = rewriteResponse.object as {
        content: string
        summary: string
      }
      content = rewriteObject.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
      summary = rewriteObject.summary ?? summary
    }

    return { content, summary }
  }

  private async callWithModelFallback<T>(
    fn: (modelString: string) => Promise<T>,
  ): Promise<
    Result<T, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const maxAttempts = this.llmRegistry.totalModels
    let lastError: Error | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let selection: ModelSelection

      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const modelString = this.llmRegistry.toMastraModelString(selection)
      this.logger.info('Attempting generation', {
        model: modelString,
        attempt: attempt + 1,
      })

      try {
        const result = await Promise.race([
          fn(modelString),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Agent timeout')),
              AGENT_TIMEOUT_MS,
            ),
          ),
        ])

        this.llmRegistry.reportSuccess(selection.modelKey)
        return Result.ok(result)
      } catch (error) {
        this.logger.warn('Model attempt failed', {
          model: modelString,
          attempt: attempt + 1,
          error: String(error),
        })
        this.llmRegistry.reportFailure(selection.modelKey, error)
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    return Result.err(
      new ExternalServiceError({
        service: 'llm',
        message: `All models failed: ${lastError?.message}`,
      }),
    )
  }
}
