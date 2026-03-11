import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { triggerWeeklyDigestJob } from '../services/digest-trigger-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'digest-trigger',
})

export interface DigestTriggerHandlerDeps {
  workerInternalUrl: string
  internalSecret: string
}

/**
 * POST /digests/trigger
 * Trigger manual do weekly digest. userId vem da sessão (Better Auth) ou do body (internal calls).
 */
export async function handleTriggerWeeklyDigest(
  c: Context,
  deps: DigestTriggerHandlerDeps,
): Promise<Response> {
  let userId: string | undefined

  const sessionUser = c.get('user') as Record<string, unknown> | undefined
  if (sessionUser?.id) {
    userId = sessionUser.id as string
  } else {
    // Internal call (x-internal-secret bypass): get from body
    let body: Record<string, unknown> = {}
    const contentType = c.req.header('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        body = (await c.req.json()) as Record<string, unknown>
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
      }
    }
    userId = typeof body.userId === 'string' ? body.userId : undefined
  }

  if (!userId) {
    return c.json({ error: 'Could not resolve userId' }, 400)
  }

  const result = await triggerWeeklyDigestJob(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    },
    userId,
  )

  if (result.isErr()) {
    logger.error('Failed to trigger weekly digest job on worker', {
      error: result.error.message,
    })
    return c.json({ error: 'Worker unavailable' }, 503)
  }

  return c.json({ ok: true, accepted: true }, 202)
}
