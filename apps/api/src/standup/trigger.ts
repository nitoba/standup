import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { z } from 'zod'
import { triggerStandupJob } from '../services/standup-trigger-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-trigger',
})

export const triggerBodySchema = z.object({
  discordUserId: z.string().min(1),
  extraContext: z.string().optional(),
  forceRegenerate: z.boolean().optional(),
})

export type TriggerBody = z.infer<typeof triggerBodySchema>

export interface TriggerHandlerDeps {
  allowedDiscordUserId: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * POST /standups/trigger
 * Trigger manual autenticado por discordUserId (comparação com DISCORD_USER_ID).
 */
export async function handleTriggerStandup(
  c: Context,
  body: TriggerBody,
  deps: TriggerHandlerDeps,
): Promise<Response> {
  if (body.discordUserId !== deps.allowedDiscordUserId) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const result = await triggerStandupJob(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    },
    {
      extraContext: body.extraContext,
      forceRegenerate: body.forceRegenerate,
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
