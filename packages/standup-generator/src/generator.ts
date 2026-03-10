import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { AzureMcpClient, EnrichedGitActivity } from '@standup/azure-devops'
import { createAzureMcpClient, enrichGitActivity } from '@standup/azure-devops'
import type {
  GatheredGitActivity,
  GeneratedStandup,
  GenerateStandupInput,
} from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateText, Output } from 'ai'
import * as z from 'zod'
import {
  buildRewriteUserMessage,
  buildSystemPrompt,
  buildUserMessage,
  MAX_STANDUP_CONTENT_CHARS,
} from './prompt/prompt.js'
import type { GeneratorConfig } from './types.js'

const logger = createServiceLogger({
  service: 'standup-generator',
  component: 'generator',
})

const standupOutputSchema = z.object({
  content: z.string().describe('Full standup markdown content in Portuguese'),
  summary: z.string().describe('One-line summary in Portuguese for logging'),
})

type StandupOutput = z.infer<typeof standupOutputSchema>

export type { GeneratorConfig }

// ---------------------------------------------------------------------------
// Retry config
// ---------------------------------------------------------------------------

const ENRICHMENT_MAX_ATTEMPTS = 2
const ENRICHMENT_RETRY_DELAY_MS = 3_000

const LLM_MAX_ATTEMPTS = 3
const LLM_RETRY_DELAY_MS = 2_000

// ---------------------------------------------------------------------------
// Generic retry helper
// ---------------------------------------------------------------------------

/**
 * Runs `fn` up to `maxAttempts` times with exponential backoff.
 * Returns the first Ok result, or the last Err if all attempts fail.
 */
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
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  // biome-ignore lint/style/noNonNullAssertion: always non null
  return lastResult!
}

// ---------------------------------------------------------------------------
// MCP enrichment helpers
// ---------------------------------------------------------------------------

/**
 * Runs enrichment using the given MCP client.
 *
 * When `isShared` is true the client is a long-lived singleton that was
 * connected at process startup — we skip connect/disconnect.
 *
 * When `isShared` is false the client is ephemeral (created per retry
 * attempt) — we connect before use and disconnect in .finally().
 */
function runEnrichment(
  input: GenerateStandupInput,
  mcpClient: AzureMcpClient,
  isShared: boolean,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>> {
  const promise = Result.gen(async function* () {
    if (!isShared) {
      yield* Result.await(mcpClient.connect())
    }

    const enriched = yield* Result.await(
      Result.tryPromise({
        try: () => enrichGitActivity(input.gitActivity, mcpClient),
        catch: (err) =>
          new ExternalServiceError({
            service: 'azure-devops',
            message: `Enrichment threw: ${err instanceof Error ? err.message : String(err)}`,
          }),
      }),
    )

    // enrichGitActivity itself returns Result<EnrichedGitActivity, ExternalServiceError>
    // yield* unwraps it: short-circuits on Err, returns the value on Ok
    return Result.ok(yield* enriched)
  })

  // Only disconnect ephemeral clients — shared singleton stays alive.
  if (isShared) {
    return promise
  }
  return promise.finally(() => mcpClient.disconnect())
}

/**
 * Builds a fallback EnrichedGitActivity from raw git data when MCP is unavailable.
 * enrichedItems is empty — the LLM will use only commit messages.
 */
function buildFallbackEnrichedActivity(
  gitActivity: GatheredGitActivity,
): EnrichedGitActivity {
  return {
    timestamp: gitActivity.timestamp,
    userUuid: 'unknown',
    repos: gitActivity.repos.map((repo) => ({
      ...repo,
      enrichedItems: [],
    })),
  }
}

/**
 * Attempts enrichment up to ENRICHMENT_MAX_ATTEMPTS times.
 * If all attempts fail, returns a fallback built from raw git data.
 * Never throws — always returns a usable EnrichedGitActivity.
 *
 * When `config.mcpClient` is set (shared singleton), the same connected
 * client is reused across retries. Otherwise a fresh ephemeral client is
 * created per attempt (previous connection may be broken).
 */
async function withEnrichmentRetry(
  input: GenerateStandupInput,
  config: GeneratorConfig,
): Promise<EnrichedGitActivity> {
  const sharedClient = config.mcpClient
  const result = await withRetry(
    () => {
      if (sharedClient) {
        return runEnrichment(input, sharedClient, true)
      }
      // Ephemeral: create a fresh MCP client per attempt.
      const mcpClient = createAzureMcpClient(config.azure)
      return runEnrichment(input, mcpClient, false)
    },
    {
      label: 'MCP enrichment',
      maxAttempts: ENRICHMENT_MAX_ATTEMPTS,
      baseDelayMs: ENRICHMENT_RETRY_DELAY_MS,
    },
  )

  if (result.isOk()) {
    logger.info('Enrichment complete', {
      repoCount: result.value.repos.length,
      totalWorkItems: result.value.repos.reduce(
        (sum: number, r: { enrichedItems: unknown[] }) =>
          sum + r.enrichedItems.length,
        0,
      ),
    })
    return result.value
  }

  logger.warn(
    'MCP enrichment failed after all retries — generating standup with git data only',
    { error: result.error.message },
  )
  return buildFallbackEnrichedActivity(input.gitActivity)
}

// ---------------------------------------------------------------------------
// LLM generation helper
// ---------------------------------------------------------------------------

function countCharacters(text: string): number {
  return text.length
}

function runStandupGeneration(
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
        system,
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

function getAiProviderApiKey(config: GeneratorConfig): string | undefined {
  return config.aiProviderApiKey
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateStandup(
  input: GenerateStandupInput,
  config: GeneratorConfig,
): Promise<Result<GeneratedStandup, ExternalServiceError>> {
  logger.info('Starting standup generation', {
    date: input.date,
    meetingType: input.meetingType,
  })

  const apiKey = getAiProviderApiKey(config)

  return Result.gen(async function* () {
    // Guard: auth must be configured
    if (!apiKey) {
      yield* Result.err(
        new ExternalServiceError({
          service: 'ai-provider',
          message: 'No authentication configured: set AI_PROVIDER_API_KEY',
        }),
      )
    }

    // Stage 1: MCP enrichment with retry — falls back to git-only data on failure.
    // Never short-circuits the pipeline: if MCP is unavailable the LLM still runs.
    const enrichedActivity = await withEnrichmentRetry(input, config)

    // Stage 2: LLM generation with retry
    const llmProvider = createGoogleGenerativeAI({ apiKey })
    const systemPrompt = buildSystemPrompt()

    logger.info('Calling LLM to generate standup')

    let standup = yield* Result.await(
      withRetry(
        () =>
          runStandupGeneration(
            llmProvider,
            systemPrompt,
            buildUserMessage(input, enrichedActivity),
            'LLM generation failed',
          ),
        {
          label: 'LLM generation',
          maxAttempts: LLM_MAX_ATTEMPTS,
          baseDelayMs: LLM_RETRY_DELAY_MS,
        },
      ),
    )
    let contentLength = countCharacters(standup.content)

    if (contentLength > MAX_STANDUP_CONTENT_CHARS) {
      logger.warn('Generated standup exceeded max content size, rewriting', {
        contentLength,
        maxAllowed: MAX_STANDUP_CONTENT_CHARS,
      })

      standup = yield* Result.await(
        withRetry(
          () =>
            runStandupGeneration(
              llmProvider,
              systemPrompt,
              buildRewriteUserMessage(standup.content, standup.summary),
              'LLM rewrite failed',
            ),
          {
            label: 'LLM rewrite',
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
          message: `Generated standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${contentLength})`,
        }),
      )
    }

    logger.info('Standup generated successfully', {
      summary: standup.summary,
      contentLength,
    })
    return Result.ok({ content: standup.content, summary: standup.summary })
  })
}
