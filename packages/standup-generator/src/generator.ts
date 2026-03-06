import { createGroq } from '@ai-sdk/groq'
import type {
  GatheredGitActivity,
  GeneratedStandup,
  GenerateStandupInput,
} from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateText, Output } from 'ai'
import * as z from 'zod'
import type { AzureMcpClient } from './azure/azure-mcp-client.js'
import { createAzureMcpClient } from './azure/azure-mcp-client.js'
import { enrichGitActivity } from './azure/enrich.js'
import {
  buildRewriteUserMessage,
  buildSystemPrompt,
  buildUserMessage,
  MAX_STANDUP_CONTENT_CHARS,
} from './prompt/prompt.js'
import type { EnrichedGitActivity, GeneratorConfig } from './types.js'

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
 * Connects to Azure MCP, runs enrichment, then always disconnects.
 * Uses Result.gen so connect/enrich errors short-circuit cleanly.
 * The .finally() on the returned Promise guarantees disconnect runs regardless.
 */
function runEnrichment(
  input: GenerateStandupInput,
  mcpClient: AzureMcpClient,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>> {
  return Result.gen(async function* () {
    yield* Result.await(mcpClient.connect())

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
  }).finally(() => mcpClient.disconnect())
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
 */
async function withEnrichmentRetry(
  input: GenerateStandupInput,
  config: GeneratorConfig,
): Promise<EnrichedGitActivity> {
  const result = await withRetry(
    () => {
      // Create a fresh MCP client per attempt — previous connection may be broken.
      const mcpClient = createAzureMcpClient(config.azure)
      return runEnrichment(input, mcpClient)
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
  provider: ReturnType<typeof createGroq>,
  system: string,
  prompt: string,
  errorContext: string,
): Promise<Result<StandupOutput, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const { output } = await generateText({
        model: provider('qwen/qwen3-32b'),
        output: Output.json(),
        system: `
${system}

Responda SOMENTE com JSON válido.
Não use markdown fora do campo "content".
Não use crases para envolver o JSON.
Formato exato:

{
  "content": "string",
  "summary": "string"
}

Regras:
- "content" deve ser o standup completo em Markdown, em português.
- "summary" deve ser um resumo de uma linha, em português.
- Não inclua campos extras.

      `,
        prompt,
      })
      return standupOutputSchema.parse(output)
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
    const groq = createGroq({ apiKey })
    const systemPrompt = buildSystemPrompt()

    logger.info('Calling LLM to generate standup')

    let standup = yield* Result.await(
      withRetry(
        () =>
          runStandupGeneration(
            groq,
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
              groq,
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
