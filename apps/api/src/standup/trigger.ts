import {
  getDb,
  StandupRepository,
  UserRepository,
  UserSettingsRepository,
} from '@standup/db'
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

function jsonConflict(
  c: Context,
  reason: TriggerConflictReason,
  standupId: string,
): Response {
  return c.json({ ok: false, accepted: false, reason, standupId }, 409)
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
    const discordResult = await userRepo.findDiscordIdByUserId(userId)
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

  // Look up user_settings for git config
  const db = getDb(deps.databaseUrl)
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
        error: 'No repos configured. Select repos via /standup settings first.',
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
    return c.json({ error: 'Could not evaluate current standup status' }, 503)
  }

  const todayStandup = todayStandupResult.value

  // Explicit replace: forceRegenerate + replaceStandupId matching today's standup
  // bypasses the pending_review guard (mirrors how the Discord bot first rejects then re-triggers)
  const isExplicitReplace =
    body.forceRegenerate === true &&
    body.replaceStandupId != null &&
    body.replaceStandupId === todayStandup?.id

  if (todayStandup?.status === 'pending_review' && !isExplicitReplace) {
    return jsonConflict(c, 'pending_review_exists', todayStandup.id)
  }

  if (
    todayStandup?.status === 'approved' ||
    todayStandup?.status === 'published'
  ) {
    return jsonConflict(c, 'already_approved_today', todayStandup.id)
  }

  const shouldReuseRejectedStandup =
    !body.rewriteInstruction && todayStandup?.status === 'rejected'

  const result = await triggerStandupJob(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    },
    {
      userId,
      discordUserId,
      reposRootPath: deps.reposRootPath,
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
}
