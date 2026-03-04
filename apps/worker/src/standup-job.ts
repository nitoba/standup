import type { AppEnv } from '@standup/config'
import { getDb, StandupRepository } from '@standup/db'
import { Result } from '@standup/domain'
import { collectGitActivity } from '@standup/git-collector'
import { createServiceLogger, withContext } from '@standup/logger'
import {
  determineMeetingType,
  generateStandup,
} from '@standup/standup-generator'
import { notifyStandupReady } from './standup-notifier.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'standup-job',
})

export async function runStandupJob(env: AppEnv): Promise<void> {
  const jobLogger = withContext(logger, {
    job: 'standup',
    run: Bun.randomUUIDv7(),
  })
  jobLogger.info('Standup job started')

  const result = await Result.gen(async function* () {
    // Step 1: Collect git activity
    const gitActivity = yield* Result.await(
      collectGitActivity({
        reposBasePath: env.REPOS_BASE_PATH,
        author: env.GIT_AUTHOR,
        sincePeriod: env.GIT_SINCE_PERIOD,
      }),
    )

    jobLogger.info('Git activity collected', {
      repos: gitActivity.repos.length,
    })

    if (gitActivity.repos.length === 0) {
      jobLogger.info('No commits found today — skipping standup generation')
      return Result.ok(null)
    }

    // Step 2: Generate standup via LLM + MCP enrichment
    const today = new Date().toISOString().slice(0, 10)
    const meetingType = determineMeetingType(today)

    const generated = yield* Result.await(
      generateStandup(
        { date: today, meetingType, gitActivity },
        {
          anthropicAuthToken: env.ANTHROPIC_AUTH_TOKEN,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
          azure: {
            orgUrl:
              env.AZURE_DEVOPS_ORG_URL ??
              `https://dev.azure.com/${env.AZURE_DEVOPS_ORG}`,
            defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
            pat: env.AZURE_DEVOPS_PAT,
          },
        },
      ),
    )

    jobLogger.info('Standup generated', { summary: generated.summary })

    // Step 3: Persist as draft
    const db = getDb(env.DATABASE_URL)
    const repo = new StandupRepository(db)

    const record = yield* Result.await(
      repo.create({
        id: Bun.randomUUIDv7(),
        date: today,
        meetingType,
        content: generated.content,
        sourceData: JSON.stringify(gitActivity),
      }),
    )

    jobLogger.info('Standup draft saved', { standupId: record.id })

    // Step 4: Notify discord-bot via internal HTTP — failure is non-fatal.
    // Worker não sabe nada sobre Discord. Apenas dispara uma notificação genérica.
    // O standup está salvo; o bot decide como apresentar ao usuário.
    const notifyResult = await notifyStandupReady({
      botInternalUrl: env.BOT_INTERNAL_URL,
      standupId: record.id,
      secret: env.INTERNAL_SECRET,
    })

    if (notifyResult.isErr()) {
      jobLogger.error(
        'Failed to notify bot — standup saved, approve manually via API',
        { standupId: record.id, error: notifyResult.error.message },
      )
    } else {
      jobLogger.info('Bot notified', { standupId: record.id })
    }

    return Result.ok(record.id)
  })

  if (result.isErr()) {
    jobLogger.error('Standup job failed', { error: result.error.message })
  } else if (result.value !== null) {
    jobLogger.info('Standup job completed', { standupId: result.value })
  }
}
