import { createAnthropic } from '@ai-sdk/anthropic'
import type { GeneratedStandup, GenerateStandupInput } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { AzureMcpClient } from './azure/azure-mcp-client.js'
import { createAzureMcpClient } from './azure/azure-mcp-client.js'
import { enrichGitActivity } from './azure/enrich.js'
import { buildSystemPrompt, buildUserMessage } from './prompt/prompt.js'
import type { EnrichedGitActivity, GeneratorConfig } from './types.js'

const logger = createServiceLogger({
  service: 'standup-generator',
  component: 'generator',
})

const standupOutputSchema = z.object({
  content: z.string().describe('Full standup markdown content in Portuguese'),
  summary: z.string().describe('One-line summary in Portuguese for logging'),
})

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

    logger.info('Calling LLM to generate standup')

    const { object } = yield* Result.await(
      Result.tryPromise({
        try: () =>
          generateObject({
            model: anthropic('claude-sonnet-4-6'),
            schema: standupOutputSchema,
            system: buildSystemPrompt(),
            prompt: buildUserMessage(input, enrichedActivity),
            maxOutputTokens: 4096,
          }),
        catch: (err) =>
          new ExternalServiceError({
            service: 'anthropic',
            message: `LLM generation failed: ${err instanceof Error ? err.message : String(err)}`,
          }),
      }),
    )

    logger.info('Standup generated successfully', { summary: object.summary })
    return Result.ok({ content: object.content, summary: object.summary })
  })
}
