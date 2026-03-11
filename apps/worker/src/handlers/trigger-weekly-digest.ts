import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import type { WeeklyDigestJobOptions } from '../job/weekly-digest-job.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-weekly-digest',
})

export interface TriggerWeeklyDigestHandlerDeps {
  triggerWeeklyDigestJob: (options: WeeklyDigestJobOptions) => Promise<void>
}

/**
 * Handler para POST /internal/trigger/weekly-digest.
 * Dispara o job em background e retorna imediatamente (202 Accepted).
 */
export async function handleTriggerWeeklyDigest(
  c: Context,
  deps: TriggerWeeklyDigestHandlerDeps,
): Promise<Response> {
  const startedAt = Date.now()

  // Parse body — userId is required
  let body: Record<string, unknown> = {}
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
  }

  const userId = typeof body.userId === 'string' ? body.userId : undefined

  if (!userId) {
    return c.json({ error: 'userId is required' }, 400)
  }

  const jobOptions: WeeklyDigestJobOptions = { userId }

  const dispatchResult = await Result.tryPromise({
    try: () => deps.triggerWeeklyDigestJob(jobOptions),
    catch: (error) =>
      new ExternalServiceError({
        service: 'worker',
        message: `Failed to dispatch weekly digest trigger: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })

  if (dispatchResult.isErr()) {
    logger.error('Weekly digest trigger failed before dispatch', {
      error: dispatchResult.error.message,
    })
    return c.json({ error: 'Internal server error' }, 500)
  }

  logger.info('Weekly digest trigger accepted', {
    latencyMs: Date.now() - startedAt,
    userId,
  })
  return c.json({ ok: true, accepted: true }, 202)
}
