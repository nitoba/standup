import { sValidator } from '@hono/standard-validator'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import z from 'zod'
import type { StandupJobOptions } from '../../job/standup/types'

const logger = createServiceLogger({
  service: 'worker',
  component: 'http-trigger-standup',
})

const bodySchema = z.object({
  userId: z.uuid(),
  discordUserId: z.uuid(),
  reposRootPath: z.string(),
  selectedRepos: z.array(z.string()).min(1),
  gitAuthor: z.email(),
  gitSincePeriod: z.string().optional().default('8 hours ago'),
  timezone: z.string(),
  extraContext: z.string().optional(),
  reuseExistingSource: z.boolean().default(false),
  forceRegenerate: z.boolean().default(false),
  rewriteFromStandupId: z.uuid().optional(),
  replaceStandupId: z.uuid().optional(),
  rewriteInstruction: z.string().optional(),
})

export function registerTriggerStandupRoute(
  app: Hono,
  opts: { triggerStandupJob: (options: StandupJobOptions) => Promise<void> },
): void {
  app.post(
    '/internal/trigger/standup',
    sValidator('json', bodySchema),
    async (c) => {
      const startedAt = Date.now()
      const {
        reposRootPath,
        selectedRepos,
        discordUserId,
        userId,
        gitAuthor,
        gitSincePeriod,
        timezone,
        extraContext,
        reuseExistingSource,
        rewriteFromStandupId,
        rewriteInstruction,
        replaceStandupId,
        forceRegenerate,
      } = c.req.valid('json')

      const dispatchResult = await Result.tryPromise({
        try: () =>
          opts.triggerStandupJob({
            userId,
            discordUserId,
            reposRootPath,
            selectedRepos,
            gitAuthor,
            timezone,
            gitSincePeriod,
            extraContext,
            forceRegenerate,
            replaceStandupId,
            reuseExistingSource,
            rewriteFromStandupId,
            rewriteInstruction,
          }),
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
        forceRegenerate: forceRegenerate ?? false,
        hasExtraContext: !!extraContext,
      })
      return c.json({ ok: true, accepted: true }, 202)
    },
  )
}
