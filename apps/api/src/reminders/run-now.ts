import { getDb, UserRepository, UserSettingsRepository } from '@standup/db'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { runStandupNow } from '../services/worker-facade-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'reminders-run-now',
})

export interface RunNowReminderDeps {
  databaseUrl: string
  reposRootPath: string
  workerInternalUrl: string
  internalSecret: string
}

function parseSelectedRepos(rawSelectedRepos: string): string[] {
  try {
    const parsed = JSON.parse(rawSelectedRepos)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((repo): repo is string => typeof repo === 'string')
  } catch {
    return []
  }
}

export async function handleRunNowReminder(
  c: Context,
  deps: RunNowReminderDeps,
): Promise<Response> {
  const sessionUser = c.get('user') as Record<string, unknown> | undefined
  const userId =
    typeof sessionUser?.id === 'string' ? sessionUser.id : undefined

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const db = getDb(deps.databaseUrl)
  const settingsRepo = new UserSettingsRepository(db)
  const settingsResult = settingsRepo.findByUserId(userId)

  if (settingsResult.isErr() || !settingsResult.value) {
    return c.json(
      {
        error:
          'Standup settings not configured. Open settings and save your preferences before running now.',
      },
      400,
    )
  }

  const settings = settingsResult.value
  const selectedRepos = parseSelectedRepos(settings.selectedRepos)

  if (selectedRepos.length === 0) {
    return c.json(
      {
        error:
          'No repositories selected. Open settings and choose at least one repository before running now.',
      },
      400,
    )
  }

  const userRepo = new UserRepository(db)
  const discordResult = userRepo.findDiscordIdByUserId(userId)

  if (discordResult.isErr() || !discordResult.value) {
    return c.json(
      {
        error:
          'Discord identity not found. Sign in with Discord again and retry.',
      },
      400,
    )
  }

  const result = await runStandupNow(
    {
      workerInternalUrl: deps.workerInternalUrl,
      internalSecret: deps.internalSecret,
    },
    {
      userId,
      discordUserId: discordResult.value,
      reposRootPath: deps.reposRootPath,
      selectedRepos,
      gitAuthor: settings.gitAuthor,
    },
  )

  if (result.isErr()) {
    logger.error('Failed to run standup now via worker facade', {
      error: result.error.message,
      userId,
    })
    return c.json({ error: 'Worker unavailable' }, 503)
  }

  return c.json({ ok: true, accepted: true }, 202)
}
