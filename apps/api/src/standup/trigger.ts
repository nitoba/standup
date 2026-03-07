import { getDb, UserRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import * as z from 'zod'
import { triggerStandupJob } from '../services/standup-trigger-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-trigger',
})

export const triggerBodySchema = z.object({
  extraContext: z.string().optional(),
  forceRegenerate: z.boolean().optional(),
  rewriteFromStandupId: z.string().optional(),
  rewriteInstruction: z.string().optional(),
  // Internal calls provide userId/discordUserId explicitly
  userId: z.string().optional(),
  discordUserId: z.string().optional(),
})

export type TriggerBody = z.infer<typeof triggerBodySchema>

export interface TriggerHandlerDeps {
  databaseUrl: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * POST /standups/trigger
 * Trigger manual. userId vem da sessão (Better Auth) ou do body (internal calls).
 */
export async function handleTriggerStandup(
  c: Context,
  body: TriggerBody,
  deps: TriggerHandlerDeps,
): Promise<Response> {
  let userId: string | undefined
  let discordUserId: string | undefined

  const sessionUser = c.get('user') as Record<string, unknown> | undefined
  if (sessionUser?.id) {
    // Session-authenticated user: resolve discordUserId from account table
    userId = sessionUser.id as string
    const db = getDb(deps.databaseUrl)
    const userRepo = new UserRepository(db)
    const discordResult = userRepo.findDiscordIdByUserId(userId)
    if (discordResult.isOk()) {
      discordUserId = discordResult.value ?? undefined
    }
  } else {
    // Internal call (x-internal-secret bypass): get from body
    userId = body.userId
    discordUserId = body.discordUserId
  }

  if (!userId || !discordUserId) {
    return c.json({ error: 'Could not resolve userId or discordUserId' }, 400)
  }

  const result = await triggerStandupJob(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    },
    {
      userId,
      discordUserId,
      extraContext: body.extraContext,
      forceRegenerate: body.forceRegenerate,
      rewriteFromStandupId: body.rewriteFromStandupId,
      rewriteInstruction: body.rewriteInstruction,
    },
  )

  if (result.isErr()) {
    logger.error('Failed to trigger standup job on worker', {
      error: result.error.message,
    })
    return c.json({ error: 'Worker unavailable' }, 503)
  }

  return c.json({ ok: true, accepted: true }, 202)
}
