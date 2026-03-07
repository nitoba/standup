import type { WorkerEnv } from '@standup/config'
import { getDb, JobRunRepository, StandupRepository } from '@standup/db'
import {
  DbError,
  JobAlreadyCompletedError,
  LockAlreadyHeldError,
  NotFoundError,
  Result,
  ValidationError,
} from '@standup/domain'
import { collectGitActivity } from '@standup/git-collector'
import { createServiceLogger, withContext } from '@standup/logger'
import {
  determineMeetingType,
  generateAdjustedStandup,
  generateStandup,
} from '@standup/standup-generator'
import { notifyJobFailed } from '../notifications/notify-job-failed.js'
import { notifyStandupReady } from '../notifications/notify-standup-ready.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'standup-job',
})

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

export interface StandupJobOptions {
  userId: string
  discordUserId: string
  reposBasePath: string
  gitAuthor: string
  gitSincePeriod: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
}

type ResolveAdjustmentError = DbError | NotFoundError | ValidationError

interface StandupAdjustmentRequest {
  standupId: string
  instruction: string
  previousContent: string
  sourceData: string
  meetingType: string
}

function buildGenerationExtraContext(
  options: StandupJobOptions,
): string | undefined {
  return options.extraContext?.trim() || undefined
}

async function resolveAdjustmentRequest(
  options: StandupJobOptions,
  standupRepo: StandupRepository,
): Promise<Result<StandupAdjustmentRequest | null, ResolveAdjustmentError>> {
  const rewriteInstruction = options?.rewriteInstruction?.trim()
  if (!rewriteInstruction) {
    return Result.ok(null)
  }

  const rewriteFromStandupId = options?.rewriteFromStandupId?.trim()
  if (!rewriteFromStandupId) {
    return Result.err(
      new ValidationError({
        field: 'rewriteFromStandupId',
        message:
          'rewriteFromStandupId is required when rewriteInstruction is provided',
      }),
    )
  }

  const baseStandup = await standupRepo.findByIdForUser(
    rewriteFromStandupId,
    options.userId,
  )
  if (baseStandup.isErr()) {
    return baseStandup
  }

  return Result.ok({
    standupId: rewriteFromStandupId,
    instruction: rewriteInstruction,
    previousContent: baseStandup.value.content,
    sourceData: baseStandup.value.sourceData,
    meetingType: baseStandup.value.meetingType,
  })
}

export async function runStandupJob(
  env: WorkerEnv,
  options: StandupJobOptions,
): Promise<void> {
  const runId = Bun.randomUUIDv7()
  const today = new Date().toISOString().slice(0, 10)

  const jobLogger = withContext(logger, {
    job: 'standup',
    run: runId,
    date: today,
  })

  jobLogger.info('Standup job started')

  // ---------------------------------------------------------------------------
  // Padrão 2 (Akita): Lock distribuído — evita execução concorrente.
  // Padrão 3 (Akita): Idempotência — se já rodou com sucesso hoje, no-op.
  // ---------------------------------------------------------------------------

  const db = getDb(env.DATABASE_URL)
  const jobRunRepo = new JobRunRepository(db)
  const standupRepo = new StandupRepository(db)

  const lockResult = await jobRunRepo.acquireLock({
    id: runId,
    jobName: 'standup',
    date: today,
    userId: options.userId,
    forceRegenerate: options.forceRegenerate,
  })

  if (lockResult.isErr()) {
    if (LockAlreadyHeldError.is(lockResult.error)) {
      jobLogger.warn(
        'Job already running — skipping (lock held by another instance)',
      )
      return
    }
    if (JobAlreadyCompletedError.is(lockResult.error)) {
      jobLogger.info('Job already completed for today — no-op (idempotent)')
      return
    }
    // DbError ao tentar adquirir lock: logar e abortar sem notificar (infra issue)
    jobLogger.error('Failed to acquire job lock', {
      error: lockResult.error.message,
    })
    return
  }

  // ---------------------------------------------------------------------------
  // Pipeline: collect → generate (com retry + degradação graciosa) → persist → notify
  // ---------------------------------------------------------------------------

  const result = await Result.gen(async function* () {
    const generatorConfig = {
      aiProviderApiKey: env.AI_PROVIDER_API_KEY,
      azure: {
        orgUrl: `https://dev.azure.com/${env.AZURE_DEVOPS_ORG}`,
        defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
        pat: env.AZURE_DEVOPS_PAT,
      },
    }
    const generationExtraContext = buildGenerationExtraContext(options)
    const adjustmentRequest = yield* Result.await(
      resolveAdjustmentRequest(options, standupRepo),
    )

    if (adjustmentRequest) {
      jobLogger.info('Adjustment mode requested', {
        baseStandupId: adjustmentRequest.standupId,
      })

      const adjusted = yield* Result.await(
        generateAdjustedStandup(
          {
            previousContent: adjustmentRequest.previousContent,
            instruction: adjustmentRequest.instruction,
            extraContext: generationExtraContext,
          },
          generatorConfig,
        ),
      )

      jobLogger.info('Adjusted standup generated', {
        summary: adjusted.summary,
        baseStandupId: adjustmentRequest.standupId,
      })

      const record = yield* Result.await(
        standupRepo.create({
          id: Bun.randomUUIDv7(),
          date: today,
          meetingType: adjustmentRequest.meetingType,
          content: adjusted.content,
          sourceData: adjustmentRequest.sourceData,
          userId: options.userId,
        }),
      )

      jobLogger.info('Adjusted standup draft saved', {
        standupId: record.id,
        baseStandupId: adjustmentRequest.standupId,
      })

      const notifyResult = await notifyStandupReady({
        botInternalUrl: env.BOT_INTERNAL_URL,
        standupId: record.id,
        discordUserId: options.discordUserId,
        secret: env.INTERNAL_SECRET,
      })

      if (notifyResult.isErr()) {
        jobLogger.error(
          'Failed to notify bot — adjusted standup saved, approve manually via API',
          { standupId: record.id, error: notifyResult.error.message },
        )
      } else {
        jobLogger.info('Bot notified', { standupId: record.id })
      }

      return Result.ok(record.id)
    }

    // Step 1: Collect git activity
    const gitActivity = yield* Result.await(
      collectGitActivity({
        reposBasePath: options.reposBasePath,
        author: options.gitAuthor,
        sincePeriod: options.gitSincePeriod,
      }),
    )

    jobLogger.info('Git activity collected', {
      repos: gitActivity.repos.length,
    })

    if (gitActivity.repos.length === 0) {
      jobLogger.info('No commits found today — skipping standup generation')
      return Result.ok(null)
    }

    const meetingType = determineMeetingType(today)

    // Step 2: Generate standup.
    // Retry para erros de MCP e LLM e feito internamente por generateStandup().
    // Degradacao graciosa: se MCP falhar apos todos os retries, o standup e gerado
    // apenas com dados git (sem enrichment de work items).
    const generated = yield* Result.await(
      generateStandup(
        {
          date: today,
          meetingType,
          gitActivity,
          extraContext: generationExtraContext,
        },
        generatorConfig,
      ),
    )

    jobLogger.info('Standup generated', { summary: generated.summary })

    // Step 3: Persist as draft
    const record = yield* Result.await(
      standupRepo.create({
        id: Bun.randomUUIDv7(),
        date: today,
        meetingType,
        content: generated.content,
        sourceData: JSON.stringify(gitActivity),
        userId: options.userId,
      }),
    )

    jobLogger.info('Standup draft saved', { standupId: record.id })

    // Step 4: Notify discord-bot — non-fatal.
    // Worker não sabe nada sobre Discord. O standup está salvo;
    // o bot decide como apresentar ao usuário.
    const notifyResult = await notifyStandupReady({
      botInternalUrl: env.BOT_INTERNAL_URL,
      standupId: record.id,
      discordUserId: options.discordUserId,
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

  // ---------------------------------------------------------------------------
  // Finalização: libera lock + notifica falha (Padrão 6 do Akita)
  // ---------------------------------------------------------------------------

  if (result.isErr()) {
    jobLogger.error('Standup job failed', { error: result.error.message })

    await jobRunRepo.releaseLock(runId, 'failed', result.error.message)

    // Padrão 8 do Akita: notificar falha no canal Discord para visibilidade imediata.
    // Non-fatal: se o bot não estiver disponível, o erro já foi logado acima.
    const failNotifyResult = await notifyJobFailed({
      botInternalUrl: env.BOT_INTERNAL_URL,
      secret: env.INTERNAL_SECRET,
      error: result.error.message,
      context: 'standup-job',
    })

    if (failNotifyResult.isErr()) {
      jobLogger.warn(
        'Failed to notify bot about job failure — check logs manually',
        { error: failNotifyResult.error.message },
      )
    }
  } else {
    const standupId = result.value
    await jobRunRepo.releaseLock(runId, 'success')

    if (standupId !== null) {
      jobLogger.info('Standup job completed', { standupId })
    } else {
      jobLogger.info(
        'Standup job completed — no standup generated (no commits or skipped)',
      )
    }
  }
}
