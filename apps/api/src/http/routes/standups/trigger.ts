import { sValidator } from '@hono/standard-validator'
import {
  getDb,
  StandupRepository,
  UserRepository,
  UserSettingsRepository,
} from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import * as z from 'zod'
import { triggerStandupJob } from '../../../services/standup-trigger-service.js'
import type { AppContext } from '../../types.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-trigger',
})

export const triggerBodySchema = z.object({
  extraContext: z.string().optional(),
  forceRegenerate: z.boolean().optional(),
  rewriteFromStandupId: z.string().optional(),
  rewriteInstruction: z.string().optional(),
  replaceStandupId: z.string().optional(),
  reuseExistingSource: z.boolean().optional(),
  // Internal calls provide userId/discordUserId explicitly
  userId: z.string().optional(),
  discordUserId: z.string().optional(),
})

export type TriggerBody = z.infer<typeof triggerBodySchema>

export interface TriggerHandlerDeps {
  databaseUrl: string
  reposRootPath: string
  workerInternalUrl: string
  internalSecret: string
}

type TriggerConflictReason = 'pending_review_exists' | 'already_approved_today'

function getSessionUserId(c: {
  get: (key: string) => unknown
}): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return typeof user?.id === 'string' ? user.id : undefined
}

/**
 * POST /standups/trigger
 * Trigger manual. userId vem da sessão (Better Auth) ou do body (internal calls).
 */
export function registerTriggerStandupRoute(
  app: Hono<AppContext>,
  opts: TriggerHandlerDeps,
): void {
  app.post(
    '/standups/trigger',
    sValidator('json', triggerBodySchema),
    async (c) => {
      const body = c.req.valid('json')

      let userId: string | undefined
      let discordUserId: string | undefined

      const sessionUserId = getSessionUserId(c)
      if (sessionUserId) {
        userId = sessionUserId
        const db = getDb(opts.databaseUrl)
        const userRepo = new UserRepository(db)
        const discordResult = await userRepo.findDiscordIdByUserId(userId)
        if (discordResult.isOk()) {
          discordUserId = discordResult.value ?? undefined
        }
      } else {
        userId = body.userId
        discordUserId = body.discordUserId
      }

      if (!userId || !discordUserId) {
        return c.json(
          { error: 'Could not resolve userId or discordUserId' },
          400,
        )
      }

      const db = getDb(opts.databaseUrl)
      const settingsRepo = new UserSettingsRepository(db)
      const standupRepo = new StandupRepository(db)
      const settingsResult = await settingsRepo.findByUserId(userId)
      if (settingsResult.isErr() || !settingsResult.value) {
        return c.json(
          {
            error:
              'User settings not found. Configure via /standup settings first.',
          },
          400,
        )
      }

      const settings = settingsResult.value
      const selectedRepos: string[] = (() => {
        try {
          const parsed = JSON.parse(settings.selectedRepos)
          if (Array.isArray(parsed)) {
            return parsed.filter((r): r is string => typeof r === 'string')
          }
          return []
        } catch {
          return []
        }
      })()

      if (selectedRepos.length === 0) {
        return c.json(
          {
            error:
              'No repos configured. Select repos via /standup settings first.',
          },
          400,
        )
      }

      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: settings.timezone,
      }).format(new Date())
      const todayStandupResult = await standupRepo.findLatestByUserAndDate(
        userId,
        today,
      )

      if (todayStandupResult.isErr()) {
        logger.error('Failed to load current standup before trigger', {
          error: todayStandupResult.error.message,
          userId,
          date: today,
        })
        return c.json(
          { error: 'Could not evaluate current standup status' },
          503,
        )
      }

      const todayStandup = todayStandupResult.value

      const isExplicitReplace =
        body.forceRegenerate === true &&
        body.replaceStandupId != null &&
        body.replaceStandupId === todayStandup?.id

      if (todayStandup?.status === 'pending_review' && !isExplicitReplace) {
        return c.json(
          {
            ok: false,
            accepted: false,
            reason: 'pending_review_exists' as TriggerConflictReason,
            standupId: todayStandup.id,
          },
          409,
        )
      }

      if (
        todayStandup?.status === 'approved' ||
        todayStandup?.status === 'published'
      ) {
        return c.json(
          {
            ok: false,
            accepted: false,
            reason: 'already_approved_today' as TriggerConflictReason,
            standupId: todayStandup.id,
          },
          409,
        )
      }

      const shouldReuseRejectedStandup =
        !body.rewriteInstruction && todayStandup?.status === 'rejected'

      const result = await triggerStandupJob(
        {
          workerInternalUrl: opts.workerInternalUrl,
          internalSecret: opts.internalSecret,
        },
        {
          userId,
          discordUserId,
          reposRootPath: opts.reposRootPath,
          selectedRepos,
          gitAuthor: settings.gitAuthor,
          timezone: settings.timezone,
          gitSincePeriod: settings.gitSincePeriod,
          extraContext: body.extraContext,
          forceRegenerate: shouldReuseRejectedStandup || body.forceRegenerate,
          rewriteFromStandupId: body.rewriteFromStandupId,
          rewriteInstruction: body.rewriteInstruction,
          replaceStandupId:
            body.replaceStandupId ??
            (shouldReuseRejectedStandup ? todayStandup.id : undefined),
          reuseExistingSource:
            body.reuseExistingSource ?? shouldReuseRejectedStandup,
        },
      )

      if (result.isErr()) {
        logger.error('Failed to trigger standup job on worker', {
          error: result.error.message,
        })
        return c.json({ error: 'Worker unavailable' }, 503)
      }

      return c.json({ ok: true, accepted: true }, 202)
    },
  )
}
