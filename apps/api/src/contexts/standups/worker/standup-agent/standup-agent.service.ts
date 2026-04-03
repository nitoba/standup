import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core'
import { Injectable } from '@nestjs/common'
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
import { LlmProviderRegistry } from '../standup-generator/llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from '../standup-generator/standup-prompt.service'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { AgentSessionManager } from './agent-session-manager'
import { buildSeedMessages } from './build-seed-messages'
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

export interface AgentGenerateResult extends GeneratedStandup {
  agent: Agent
}

const AGENT_TIMEOUT_MS = 60_000

@Injectable()
export class StandupAgentService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly sessionManager: AgentSessionManager,
  ) {
    this.logger = this.loggerFactory.create('standup-agent')
  }

  /**
   * Resolves API keys for pi-ai providers.
   * pi-ai expects GEMINI_API_KEY for Google, but our config uses GOOGLE_API_KEY.
   */
  private resolveApiKey(provider: string): string | undefined {
    const config = this.runtimeConfig.config
    const keyMap: Record<string, string> = {
      google: config.GOOGLE_API_KEY,
      groq: config.GROQ_API_KEY,
      openrouter: config.OPENROUTER_API_KEY,
    }
    return keyMap[provider]
  }

  async generate(
    input: AgentGenerateInput,
  ): Promise<
    Result<
      AgentGenerateResult,
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
          getApiKey: (p) => this.resolveApiKey(p),
        })

        const unsubscribe = this.subscribeToContentDeltas(
          agent,
          input.onContentDelta,
        )

        try {
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
                agent,
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
            agent,
          })
        } finally {
          unsubscribe()
        }
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

  async adjust(
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    await input.onStageChange?.('generating_standup')

    const existingAgent = this.sessionManager.get(input.standupId)

    if (existingAgent) {
      return this.adjustWithExistingAgent(existingAgent, input)
    }

    return this.adjustWithSeedAgent(input)
  }

  private async adjustWithExistingAgent(
    agent: Agent,
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    const adjustPrompt = input.extraContext
      ? `${input.instruction}\n\nContexto adicional: ${input.extraContext}`
      : input.instruction

    const unsubscribe = this.subscribeToContentDeltas(
      agent,
      input.onContentDelta,
    )

    try {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        agent.prompt(adjustPrompt),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('Agent adjust timed out')),
            AGENT_TIMEOUT_MS,
          )
        }),
      ]).finally(() => clearTimeout(timeoutHandle))

      const result = extractSubmitStandupResult(agent.state.messages)
      if (!result) {
        return Result.err(
          new ExternalServiceError({
            service: 'pi-agent',
            message: 'Agent did not call submit_standup tool during adjust',
          }),
        )
      }

      return Result.ok({
        content:
          result.content.length > MAX_STANDUP_CONTENT_CHARS
            ? result.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
            : result.content,
        summary: result.summary,
      })
    } catch (error) {
      return Result.err(
        new ExternalServiceError({
          service: 'pi-agent',
          message: `Agent adjust failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    } finally {
      unsubscribe()
    }
  }

  private async adjustWithSeedAgent(
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: true,
      hasBoard: false,
    })

    const seedMessages = buildSeedMessages({
      content: input.previousContent,
      summary: input.previousSummary,
    })

    const adjustPrompt = input.extraContext
      ? `${input.instruction}\n\nContexto adicional: ${input.extraContext}`
      : input.instruction

    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown

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
        this.logger.info('Creating seed agent for adjust', {
          model: modelKey,
          provider,
          tier,
          standupId: input.standupId,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [submitStandupTool],
            messages: seedMessages as AgentMessage[],
          },
          getApiKey: (p) => this.resolveApiKey(p),
        })

        const unsubscribe = this.subscribeToContentDeltas(
          agent,
          input.onContentDelta,
        )

        try {
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          await Promise.race([
            agent.prompt(adjustPrompt),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error('Agent seed adjust timed out')),
                AGENT_TIMEOUT_MS,
              )
            }),
          ]).finally(() => clearTimeout(timeoutHandle))

          const result = extractSubmitStandupResult(agent.state.messages)
          if (!result) {
            this.logger.warn('Seed agent did not call submit_standup', {
              model: modelKey,
              provider,
            })
            lastError = new Error('Agent did not call submit_standup tool')
            continue
          }

          this.llmRegistry.reportSuccess(modelKey)
          this.sessionManager.create(input.standupId, agent)

          return Result.ok({
            content:
              result.content.length > MAX_STANDUP_CONTENT_CHARS
                ? result.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
                : result.content,
            summary: result.summary,
          })
        } finally {
          unsubscribe()
        }
      } catch (error) {
        lastError = error
        this.logger.warn('Seed agent adjust failed', {
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
        message: `PI Agent adjust: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
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
          service: 'pi-agent',
          message: 'No standups provided for weekly insights generation',
        }),
      )
    }

    const systemPrompt = this.standupPrompt.buildWeeklyInsightsSystemPrompt()
    const userMessage =
      this.standupPrompt.buildWeeklyInsightsUserMessage(standups)

    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown

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
        this.logger.info('Calling PI Agent for weekly insights', {
          model: modelKey,
          provider,
          tier,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [],
            messages: [],
          },
          getApiKey: (p) => this.resolveApiKey(p),
        })

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          agent.prompt(userMessage),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('Agent weekly insights timed out')),
              AGENT_TIMEOUT_MS,
            )
          }),
        ]).finally(() => clearTimeout(timeoutHandle))

        const text = this.extractLastAssistantText(agent.state.messages)
        if (!text) {
          this.logger.warn('Agent produced no text for weekly insights', {
            model: modelKey,
            provider,
          })
          lastError = new Error('Agent produced no text')
          continue
        }

        this.llmRegistry.reportSuccess(modelKey)
        return Result.ok(text)
      } catch (error) {
        lastError = error
        this.logger.warn('PI Agent weekly insights failed', {
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
        message: `PI Agent weekly insights: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
    )
  }

  private extractLastAssistantText(messages: AgentMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg && 'role' in msg && (msg as { role: string }).role === 'assistant') {
        const content = (msg as { role: string; content: Array<{ type: string; text?: string }> }).content
        const textParts = content
          .filter((c) => c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text as string)
        const joined = textParts.join('').trim()
        if (joined) return joined
      }
    }
    return null
  }

  private subscribeToContentDeltas(
    agent: Agent,
    onContentDelta?: (partialContent: string) => void,
  ): () => void {
    if (!onContentDelta) return () => {}

    let accumulatedArgs = ''
    let isSubmitStandupCall = false

    return agent.subscribe((event) => {
      if (event.type !== 'message_update') return

      const msgEvent = event.assistantMessageEvent

      if (msgEvent.type === 'toolcall_start') {
        const partial = msgEvent.partial
        const lastContent = partial.content[msgEvent.contentIndex]
        if (
          lastContent &&
          'name' in lastContent &&
          lastContent.name === 'submit_standup'
        ) {
          isSubmitStandupCall = true
          accumulatedArgs = ''
        }
      }

      if (msgEvent.type === 'toolcall_delta' && isSubmitStandupCall) {
        accumulatedArgs += msgEvent.delta
        const content = this.extractPartialContent(accumulatedArgs)
        if (content) {
          onContentDelta(content)
        }
      }

      if (msgEvent.type === 'toolcall_end') {
        isSubmitStandupCall = false
        accumulatedArgs = ''
      }
    })
  }

  private extractPartialContent(partialJson: string): string | null {
    // Try full parse first
    try {
      const parsed = JSON.parse(partialJson)
      if (typeof parsed.content === 'string') return parsed.content
    } catch {
      // Expected — JSON is incomplete
    }

    // Regex for partial JSON: find "content":"..." even if unclosed
    const match = partialJson.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (match?.[1]) {
      return match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }

    return null
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
