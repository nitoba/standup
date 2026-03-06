import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-standup',
})

export interface StandupJobOptions {
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
}

export interface TriggerStandupHandlerDeps {
  triggerStandupJob: (options?: StandupJobOptions) => Promise<void>
}

/**
 * Handler para POST /internal/trigger/standup.
 * Dispara o job em background e retorna imediatamente (202 Accepted).
 * Aceita body opcional com extraContext e forceRegenerate.
 */
export async function handleTriggerStandup(
  c: Context,
  deps: TriggerStandupHandlerDeps,
): Promise<Response> {
  const startedAt = Date.now()

  // Parse optional body — empty body is valid (backwards-compatible)
  let jobOptions: StandupJobOptions | undefined
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const body = (await c.req.json()) as Record<string, unknown>
      if (body && typeof body === 'object') {
        const parsedExtraContext =
          typeof body.extraContext === 'string' ? body.extraContext : undefined
        const parsedForceRegenerate =
          typeof body.forceRegenerate === 'boolean'
            ? body.forceRegenerate
            : undefined
        const parsedRewriteFromStandupId =
          typeof body.rewriteFromStandupId === 'string'
            ? body.rewriteFromStandupId
            : undefined
        const parsedRewriteInstruction =
          typeof body.rewriteInstruction === 'string'
            ? body.rewriteInstruction
            : undefined

        jobOptions = {
          ...(parsedExtraContext !== undefined
            ? { extraContext: parsedExtraContext }
            : {}),
          ...(parsedForceRegenerate !== undefined
            ? { forceRegenerate: parsedForceRegenerate }
            : {}),
          ...(parsedRewriteFromStandupId !== undefined
            ? { rewriteFromStandupId: parsedRewriteFromStandupId }
            : {}),
          ...(parsedRewriteInstruction !== undefined
            ? { rewriteInstruction: parsedRewriteInstruction }
            : {}),
        }
      }
    } catch {
      // Empty or malformed body — ignore, run without options
    }
  }

  const dispatchResult = await Result.tryPromise({
    try: () => deps.triggerStandupJob(jobOptions),
    catch: (error) =>
      new ExternalServiceError({
        service: 'worker',
        message: `Failed to dispatch manual trigger: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })

  if (dispatchResult.isErr()) {
    logger.error('Manual trigger failed before dispatch', {
      error: dispatchResult.error.message,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }

  logger.info('Manual trigger accepted', {
    latencyMs: Date.now() - startedAt,
    forceRegenerate: jobOptions?.forceRegenerate ?? false,
    hasExtraContext: !!jobOptions?.extraContext,
  })
  return c.json({ ok: true, accepted: true }, 202)
}
