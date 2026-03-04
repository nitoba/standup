import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-standup',
})

export interface TriggerStandupHandlerDeps {
  triggerStandupJob: () => Promise<void>
}

/**
 * Handler para POST /internal/trigger/standup.
 * Dispara o job em background e retorna imediatamente (202 Accepted).
 */
export async function handleTriggerStandup(
  c: Context,
  deps: TriggerStandupHandlerDeps,
): Promise<Response> {
  const startedAt = Date.now()

  const dispatchResult = await Result.tryPromise({
    try: deps.triggerStandupJob,
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
  })
  return c.json({ ok: true, accepted: true }, 202)
}
