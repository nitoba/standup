import { createAnthropic } from '@ai-sdk/anthropic'
import type { GeneratedStandup, GenerateStandupInput } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateObject } from 'ai'
import { z } from 'zod'
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

function countCharacters(text: string): number {
  return Array.from(text).length
}

function runStandupGeneration(
  anthropic: ReturnType<typeof createAnthropic>,
  system: string,
  prompt: string,
  errorContext: string,
): Promise<Result<StandupOutput, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const { object } = await generateObject({
        model: anthropic('claude-sonnet-4-6'),
        schema: standupOutputSchema,
        system,
        prompt,
        maxOutputTokens: 4096,
      })

      return object
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'anthropic',
        message: `${errorContext}: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}

export async function generateStandup(
  input: GenerateStandupInput,
  config: GeneratorConfig,
): Promise<Result<GeneratedStandup, ExternalServiceError>> {
  logger.info('Starting standup generation', {
    date: input.date,
    meetingType: input.meetingType,
  })

  const authToken = config.anthropicAuthToken
  const apiKey = config.anthropicApiKey

  return Result.gen(async function* () {
    // Guard: auth must be configured
    if (!authToken && !apiKey) {
      yield* Result.err(
        new ExternalServiceError({
          service: 'anthropic',
          message:
            'No authentication configured: set ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY',
        }),
      )
    }

    // Stage 1: MCP enrichment (connect → enrich → disconnect always)
    const mcpClient = createAzureMcpClient(config.azure)
    const enrichedActivity = yield* Result.await(
      runEnrichment(input, mcpClient),
    )

    logger.info('Enrichment complete', {
      repoCount: enrichedActivity.repos.length,
      totalWorkItems: enrichedActivity.repos.reduce(
        (sum: number, r: { enrichedItems: unknown[] }) =>
          sum + r.enrichedItems.length,
        0,
      ),
    })

    // Stage 2: LLM generation
    const anthropicOptions = authToken
      ? {
          apiKey: 'sk-dummy',
          headers: { Authorization: `Bearer ${authToken}` },
        }
      : { apiKey: apiKey ?? '' }
    const anthropic = createAnthropic(anthropicOptions)
    const systemPrompt = buildSystemPrompt()

    logger.info('Calling LLM to generate standup')

    let standup = yield* Result.await(
      runStandupGeneration(
        anthropic,
        systemPrompt,
        buildUserMessage(input, enrichedActivity),
        'LLM generation failed',
      ),
    )
    let contentLength = countCharacters(standup.content)

    if (contentLength > MAX_STANDUP_CONTENT_CHARS) {
      logger.warn('Generated standup exceeded max content size, rewriting', {
        contentLength,
        maxAllowed: MAX_STANDUP_CONTENT_CHARS,
      })

      standup = yield* Result.await(
        runStandupGeneration(
          anthropic,
          systemPrompt,
          buildRewriteUserMessage(standup.content, standup.summary),
          'LLM rewrite failed',
        ),
      )
      contentLength = countCharacters(standup.content)
    }

    if (contentLength > MAX_STANDUP_CONTENT_CHARS) {
      yield* Result.err(
        new ExternalServiceError({
          service: 'anthropic',
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
