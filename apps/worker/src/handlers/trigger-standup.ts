import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-standup',
})

export interface StandupJobOptions {
  userId: string
  discordUserId: string
  reposRootPath: string
  selectedRepos: string[]
  gitAuthor: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
}

export interface TriggerStandupHandlerDeps {
  triggerStandupJob: (options: StandupJobOptions) => Promise<void>
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

  // Parse body — userId and discordUserId are required
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
  const discordUserId =
    typeof body.discordUserId === 'string' ? body.discordUserId : undefined
  const reposRootPath =
    typeof body.reposRootPath === 'string' ? body.reposRootPath : undefined
  const selectedRepos = Array.isArray(body.selectedRepos)
    ? (body.selectedRepos as unknown[]).filter(
        (r): r is string => typeof r === 'string',
      )
    : undefined
  const gitAuthor =
    typeof body.gitAuthor === 'string' ? body.gitAuthor : undefined

  if (
    !userId ||
    !discordUserId ||
    !reposRootPath ||
    !selectedRepos ||
    selectedRepos.length === 0 ||
    !gitAuthor
  ) {
    return c.json(
      {
        error:
          'userId, discordUserId, reposRootPath, selectedRepos, and gitAuthor are required',
      },
      400,
    )
  }

  const jobOptions: StandupJobOptions = {
    userId,
    discordUserId,
    reposRootPath,
    selectedRepos,
    gitAuthor,
    ...(typeof body.extraContext === 'string'
      ? { extraContext: body.extraContext }
      : {}),
    ...(typeof body.forceRegenerate === 'boolean'
      ? { forceRegenerate: body.forceRegenerate }
      : {}),
    ...(typeof body.rewriteFromStandupId === 'string'
      ? { rewriteFromStandupId: body.rewriteFromStandupId }
      : {}),
    ...(typeof body.rewriteInstruction === 'string'
      ? { rewriteInstruction: body.rewriteInstruction }
      : {}),
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
