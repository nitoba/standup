import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { GeneratedStandup } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateText, Output } from 'ai'
import * as z from 'zod'
import {
  buildAdjustUserMessage,
  buildRewriteUserMessage,
  buildSystemPrompt,
  MAX_STANDUP_CONTENT_CHARS,
} from './prompt/prompt.js'
import type { GeneratorConfig } from './types.js'

const logger = createServiceLogger({
  service: 'standup-generator',
  component: 'adjust',
})

const LLM_MAX_ATTEMPTS = 3
const LLM_RETRY_DELAY_MS = 2_000

const standupOutputSchema = z.object({
  content: z
    .string()
    .describe('Adjusted standup markdown content in Portuguese'),
  summary: z.string().describe('One-line summary in Portuguese for logging'),
})

type StandupOutput = z.infer<typeof standupOutputSchema>

export interface AdjustStandupInput {
  previousContent: string
  instruction: string
  extraContext?: string
}

function countCharacters(text: string): number {
  return text.length
}

async function withRetry<T>(
  fn: () => Promise<Result<T, ExternalServiceError>>,
  opts: { label: string; maxAttempts: number; baseDelayMs: number },
): Promise<Result<T, ExternalServiceError>> {
  let lastResult: Result<T, ExternalServiceError> | undefined

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    lastResult = await fn()

    if (lastResult.isOk()) return lastResult

    logger.warn(`${opts.label} failed`, {
      attempt,
      maxAttempts: opts.maxAttempts,
      error: lastResult.error.message,
    })

    if (attempt < opts.maxAttempts) {
      const delayMs = opts.baseDelayMs * 2 ** (attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // biome-ignore lint/style/noNonNullAssertion: always non null
  return lastResult!
}

function runGeneration(
  provider: ReturnType<typeof createGoogleGenerativeAI>,
  system: string,
  prompt: string,
  errorContext: string,
): Promise<Result<StandupOutput, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const { output } = await generateText({
        model: provider('gemini-3.1-flash-lite-preview'),
        output: Output.object({ schema: standupOutputSchema }),
        system: system,
        prompt,
      })

      return output
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'ai-provider',
        message: `${errorContext}: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}

export async function generateAdjustedStandup(
  input: AdjustStandupInput,
  config: GeneratorConfig,
): Promise<Result<GeneratedStandup, ExternalServiceError>> {
  logger.info('Starting standup adjustment')

  const apiKey = config.aiProviderApiKey

  return Result.gen(async function* () {
    if (!apiKey) {
      yield* Result.err(
        new ExternalServiceError({
          service: 'ai-provider',
          message: 'No authentication configured: set AI_PROVIDER_API_KEY',
        }),
      )
    }

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

    await config.onStageChange?.('generating_standup')
    const llmProvider = createGoogleGenerativeAI({ apiKey })
    const systemPrompt = buildSystemPrompt()

    let standup = yield* Result.await(
      withRetry(
        () =>
          runGeneration(
            llmProvider,
            systemPrompt,
            buildAdjustUserMessage(
              input.previousContent,
              input.instruction,
              input.extraContext,
            ),
            'LLM adjust failed',
          ),
        {
          label: 'LLM adjust',
          maxAttempts: LLM_MAX_ATTEMPTS,
          baseDelayMs: LLM_RETRY_DELAY_MS,
        },
      ),
    )

    let contentLength = countCharacters(standup.content)

    if (contentLength > MAX_STANDUP_CONTENT_CHARS) {
      logger.warn('Adjusted standup exceeded max content size, rewriting', {
        contentLength,
        maxAllowed: MAX_STANDUP_CONTENT_CHARS,
      })

      standup = yield* Result.await(
        withRetry(
          () =>
            runGeneration(
              llmProvider,
              systemPrompt,
              buildRewriteUserMessage(standup.content, standup.summary),
              'LLM rewrite after adjust failed',
            ),
          {
            label: 'LLM rewrite after adjust',
            maxAttempts: LLM_MAX_ATTEMPTS,
            baseDelayMs: LLM_RETRY_DELAY_MS,
          },
        ),
      )
      contentLength = countCharacters(standup.content)
    }

    if (contentLength > MAX_STANDUP_CONTENT_CHARS) {
      yield* Result.err(
        new ExternalServiceError({
          service: 'ai-provider',
          message: `Adjusted standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${contentLength})`,
        }),
      )
    }

    logger.info('Standup adjusted successfully', {
      summary: standup.summary,
      contentLength,
    })

    return Result.ok({
      content: standup.content,
      summary: standup.summary,
    })
  })
}
