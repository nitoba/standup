import type { AzureMcpClient } from '@standup/azure-devops'
import type { WorkerEnv } from '@standup/config'
import { getDb, JobRunRepository, StandupRepository } from '@standup/db'
import {
  DbError,
  type GatheredGitActivity,
  GenerateStandupInputSchema,
  JobAlreadyCompletedError,
  LockAlreadyHeldError,
  NotFoundError,
  Result,
  ValidationError,
} from '@standup/domain'
import { collectGitActivity } from '@standup/git-collector'
import { createServiceLogger, withContext } from '@standup/logger'
import { withSpan } from '@standup/observability'
import {
  determineMeetingType,
  generateAdjustedStandup,
  generateStandup,
} from '@standup/standup-generator'
import { notifyJobFailed } from '../notifications/notify-job-failed.js'
import { notifyStandupEvent } from '../notifications/notify-standup-event.js'
import { notifyStandupReady } from '../notifications/notify-standup-ready.js'
import { notifyUserDm } from '../notifications/notify-user-dm.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'standup-job',
})

// Cores de embed reutilizadas para DMs informativas ao usuário
const DM_COLORS = {
  INFO: 0x3498db, // azul — informativo
  WARNING: 0xf39c12, // âmbar — aviso não-crítico
  ERROR: 0xe74c3c, // vermelho — falha
} as const

// ---------------------------------------------------------------------------
// Main job
// ---------------------------------------------------------------------------

export interface StandupJobOptions {
  userId: string
  discordUserId: string
  /** Absolute path to the root directory where all repos are cloned (REPOS_ROOT_PATH). */
  reposRootPath: string
  /** Names of the repos to analyse (directory names under reposRootPath). */
  selectedRepos: string[]
  gitAuthor: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

type ResolveAdjustmentError = DbError | NotFoundError | ValidationError

interface StandupAdjustmentRequest {
  standupId: string
  instruction: string
  previousContent: string
  sourceData: string
  meetingType: string
}

interface ExistingSourceRequest {
  standupId: string
  previousContent: string
  gitActivity: string
  meetingType: string
}

type StandupRunMode = 'generate' | 'regenerate' | 'adjust'

type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'

function resolveRunMode(options: StandupJobOptions): StandupRunMode {
  if (options.rewriteInstruction?.trim()) {
    return 'adjust'
  }

  if (options.forceRegenerate || options.reuseExistingSource) {
    return 'regenerate'
  }

  return 'generate'
}

async function emitProgressEvent(
  env: WorkerEnv,
  input: {
    userId: string
    runId: string
    date: string
    mode: StandupRunMode
    step: StandupProgressStep
    message: string
    standupId?: string
  },
): Promise<void> {
  await notifyStandupEvent({
    apiInternalUrl: env.API_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
    event: {
      type: 'standup_progress',
      userId: input.userId,
      runId: input.runId,
      date: input.date,
      mode: input.mode,
      step: input.step,
      message: input.message,
      ...(input.standupId ? { standupId: input.standupId } : {}),
    },
  })
}

async function saveGeneratedStandup(
  standupRepo: StandupRepository,
  options: StandupJobOptions,
  input: {
    date: string
    meetingType: string
    content: string
    sourceData: string
  },
): Promise<Result<{ id: string }, DbError | NotFoundError>> {
  const replaceStandupId = options.replaceStandupId?.trim()
  if (replaceStandupId) {
    return standupRepo.replaceGeneratedForUser(
      replaceStandupId,
      options.userId,
      {
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
      },
    )
  }

  return standupRepo.create({
    id: Bun.randomUUIDv7(),
    date: input.date,
    meetingType: input.meetingType,
    content: input.content,
    sourceData: input.sourceData,
    userId: options.userId,
  })
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

async function resolveExistingSourceRequest(
  options: StandupJobOptions,
  standupRepo: StandupRepository,
): Promise<Result<ExistingSourceRequest | null, ResolveAdjustmentError>> {
  if (options.rewriteInstruction?.trim()) {
    return Result.ok(null)
  }

  if (!options.reuseExistingSource) {
    return Result.ok(null)
  }

  const replaceStandupId = options.replaceStandupId?.trim()
  if (!replaceStandupId) {
    return Result.err(
      new ValidationError({
        field: 'replaceStandupId',
        message:
          'replaceStandupId is required when reuseExistingSource is provided',
      }),
    )
  }

  const existingStandup = await standupRepo.findByIdForUser(
    replaceStandupId,
    options.userId,
  )
  if (existingStandup.isErr()) {
    return existingStandup
  }

  return Result.ok({
    standupId: replaceStandupId,
    previousContent: existingStandup.value.content,
    gitActivity: existingStandup.value.sourceData,
    meetingType: existingStandup.value.meetingType,
  })
}

function parseStoredGitActivity(
  sourceData: string,
  meetingType: string,
  date: string,
  extraContext?: string,
): Result<
  {
    date: string
    meetingType: string
    gitActivity: GatheredGitActivity
    extraContext?: string
  },
  ValidationError
> {
  try {
    const parsed = JSON.parse(sourceData) as unknown
    const validated =
      GenerateStandupInputSchema.shape.gitActivity.safeParse(parsed)
    if (!validated.success) {
      return Result.err(
        new ValidationError({
          field: 'sourceData',
          message: 'Stored standup sourceData is invalid and cannot be reused',
        }),
      )
    }

    return Result.ok({
      date,
      meetingType,
      gitActivity: validated.data,
      ...(extraContext ? { extraContext } : {}),
    })
  } catch {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'Stored standup sourceData is not valid JSON',
      }),
    )
  }
}

export async function runStandupJob(
  env: WorkerEnv,
  options: StandupJobOptions,
  mcpClient?: AzureMcpClient,
): Promise<void> {
  const runId = Bun.randomUUIDv7()
  const today = new Date().toISOString().slice(0, 10)
  const runMode = resolveRunMode(options)

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

  const db = getDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)
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
      if (options.discordUserId) {
        const dmResult = await notifyUserDm({
          botInternalUrl: env.BOT_INTERNAL_URL,
          secret: env.INTERNAL_SECRET,
          discordUserId: options.discordUserId,
          title: '⏳ Standup já em processamento',
          message:
            'Seu standup já está sendo gerado em background. Você receberá uma DM assim que estiver pronto para revisão.',
          color: DM_COLORS.WARNING,
        })
        if (dmResult.isErr()) {
          jobLogger.warn('Failed to send lock-held DM to user', {
            error: dmResult.error.message,
          })
        }
      }
      return
    }
    if (JobAlreadyCompletedError.is(lockResult.error)) {
      jobLogger.info('Job already completed for today — no-op (idempotent)')
      if (options.discordUserId) {
        const dmResult = await notifyUserDm({
          botInternalUrl: env.BOT_INTERNAL_URL,
          secret: env.INTERNAL_SECRET,
          discordUserId: options.discordUserId,
          title: '✅ Standup já gerado hoje',
          message:
            'O standup de hoje já foi gerado. Verifique sua caixa de entrada do Discord para aprová-lo ou use `/standup list` para ver o status.',
          color: DM_COLORS.INFO,
        })
        if (dmResult.isErr()) {
          jobLogger.warn('Failed to send job-completed DM to user', {
            error: dmResult.error.message,
          })
        }
      }
      return
    }
    // DbError ao tentar adquirir lock: logar e abortar sem notificar (infra issue)
    jobLogger.error('Failed to acquire job lock', {
      error: lockResult.error.message,
    })
    return
  }

  // ---------------------------------------------------------------------------
  // Lock adquirido — notificar usuário que a geração começou (feedback imediato)
  // ---------------------------------------------------------------------------

  if (options.discordUserId) {
    const startDmResult = await notifyUserDm({
      botInternalUrl: env.BOT_INTERNAL_URL,
      secret: env.INTERNAL_SECRET,
      discordUserId: options.discordUserId,
      title: '⏳ Standup já em processamento',
      message:
        'Seu standup já está sendo gerado em background. Você receberá uma DM assim que estiver pronto para revisão.',
      color: DM_COLORS.INFO,
    })
    if (startDmResult.isErr()) {
      jobLogger.warn('Failed to send start DM to user — non-fatal', {
        error: startDmResult.error.message,
      })
    }
  }

  await emitProgressEvent(env, {
    userId: options.userId,
    runId,
    date: today,
    mode: runMode,
    step: 'queued',
    message: 'Geracao do standup iniciada',
  })

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
      mcpClient,
    }
    const generationExtraContext = buildGenerationExtraContext(options)
    const adjustmentRequest = yield* Result.await(
      resolveAdjustmentRequest(options, standupRepo),
    )
    const existingSourceRequest = yield* Result.await(
      resolveExistingSourceRequest(options, standupRepo),
    )

    if (adjustmentRequest) {
      jobLogger.info('Adjustment mode requested', {
        baseStandupId: adjustmentRequest.standupId,
      })

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'generating_standup',
        message: 'Gerando standup ajustado',
        standupId: adjustmentRequest.standupId,
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

      const replaceStandupId =
        options.replaceStandupId?.trim() || adjustmentRequest.standupId
      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'saving_draft',
        message: 'Salvando rascunho ajustado',
        standupId: replaceStandupId,
      })
      const record = yield* Result.await(
        saveGeneratedStandup(
          standupRepo,
          { ...options, replaceStandupId },
          {
            date: today,
            meetingType: adjustmentRequest.meetingType,
            content: adjusted.content,
            sourceData: adjustmentRequest.sourceData,
          },
        ),
      )

      jobLogger.info('Adjusted standup draft saved', {
        standupId: record.id,
        baseStandupId: adjustmentRequest.standupId,
      })

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'notifying_review',
        message: 'Enviando standup ajustado para revisao',
        standupId: record.id,
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

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'completed',
        message: 'Standup ajustado pronto para revisao',
        standupId: record.id,
      })

      await notifyStandupEvent({
        apiInternalUrl: env.API_INTERNAL_URL,
        internalSecret: env.INTERNAL_SECRET,
        event: {
          type: 'standup_generated',
          userId: options.userId,
          runId,
          standupId: record.id,
          date: today,
          mode: runMode,
        },
      })

      return Result.ok(record.id)
    }

    if (existingSourceRequest) {
      jobLogger.info('Regeneration requested from existing standup source', {
        baseStandupId: existingSourceRequest.standupId,
      })

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'generating_standup',
        message: 'Gerando standup a partir da base existente',
        standupId: existingSourceRequest.standupId,
      })

      const generationInput = yield* parseStoredGitActivity(
        existingSourceRequest.gitActivity,
        existingSourceRequest.meetingType,
        today,
        generationExtraContext,
      )

      const regenerated = yield* Result.await(
        generateStandup(generationInput, generatorConfig),
      )

      jobLogger.info('Standup regenerated from existing source', {
        summary: regenerated.summary,
        baseStandupId: existingSourceRequest.standupId,
      })

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'saving_draft',
        message: 'Salvando standup regenerado',
        standupId: existingSourceRequest.standupId,
      })

      const record = yield* Result.await(
        saveGeneratedStandup(
          standupRepo,
          {
            ...options,
            replaceStandupId: existingSourceRequest.standupId,
          },
          {
            date: today,
            meetingType: existingSourceRequest.meetingType,
            content: regenerated.content,
            sourceData: existingSourceRequest.gitActivity,
          },
        ),
      )

      jobLogger.info('Regenerated standup draft saved', {
        standupId: record.id,
        baseStandupId: existingSourceRequest.standupId,
      })

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'notifying_review',
        message: 'Enviando standup regenerado para revisao',
        standupId: record.id,
      })

      const notifyResult = await notifyStandupReady({
        botInternalUrl: env.BOT_INTERNAL_URL,
        standupId: record.id,
        discordUserId: options.discordUserId,
        secret: env.INTERNAL_SECRET,
      })

      if (notifyResult.isErr()) {
        jobLogger.error(
          'Failed to notify bot — regenerated standup saved, approve manually via API',
          { standupId: record.id, error: notifyResult.error.message },
        )
      } else {
        jobLogger.info('Bot notified', { standupId: record.id })
      }

      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'completed',
        message: 'Standup regenerado pronto para revisao',
        standupId: record.id,
      })

      await notifyStandupEvent({
        apiInternalUrl: env.API_INTERNAL_URL,
        internalSecret: env.INTERNAL_SECRET,
        event: {
          type: 'standup_generated',
          userId: options.userId,
          runId,
          standupId: record.id,
          date: today,
          mode: runMode,
        },
      })

      return Result.ok(record.id)
    }

    // Step 1: Collect git activity
    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'collecting_git',
      message: 'Coletando commits dos repositorios',
    })

    const gitActivity = yield* Result.await(
      withSpan(
        'standup.git.collect',
        {
          'git.author': options.gitAuthor,
          'git.repos': options.selectedRepos.length,
        },
        () =>
          collectGitActivity({
            reposRootPath: options.reposRootPath,
            selectedRepos: options.selectedRepos,
            author: options.gitAuthor,
            sincePeriod: '8 hours ago',
          }),
      ),
    )

    jobLogger.info('Git activity collected', {
      repos: gitActivity.repos.length,
    })

    if (gitActivity.repos.length === 0) {
      jobLogger.info('No commits found today — skipping standup generation')
      await emitProgressEvent(env, {
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        step: 'no_activity',
        message: 'Nenhuma atividade encontrada hoje',
      })

      if (options.discordUserId) {
        const dmResult = await notifyUserDm({
          botInternalUrl: env.BOT_INTERNAL_URL,
          secret: env.INTERNAL_SECRET,
          discordUserId: options.discordUserId,
          title: '🔍 Nenhuma atividade encontrada',
          message:
            'Não encontrei commits hoje nos repositórios configurados. Verifique se os repositórios e o autor git estão corretos em `/standup settings`.',
          color: DM_COLORS.WARNING,
        })
        if (dmResult.isErr()) {
          jobLogger.warn('Failed to send no-activity DM to user', {
            error: dmResult.error.message,
          })
        }
      }
      return Result.ok(null)
    }

    const meetingType = determineMeetingType(today)

    // Step 2: Generate standup.
    // Retry para erros de MCP e LLM e feito internamente por generateStandup().
    // Degradação graciosa: se MCP falhar após todos os retries, o standup é gerado
    // apenas com dados git (sem enrichment de work items).
    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'enriching_data',
      message: 'Enriquecendo contexto para o standup',
    })

    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'generating_standup',
      message: 'Gerando texto do standup',
    })

    const generated = yield* Result.await(
      withSpan(
        'standup.llm.generate',
        { 'standup.meeting_type': meetingType, 'standup.mode': runMode },
        () =>
          generateStandup(
            {
              date: today,
              meetingType,
              gitActivity,
              extraContext: generationExtraContext,
            },
            generatorConfig,
          ),
      ),
    )

    jobLogger.info('Standup generated', { summary: generated.summary })

    // Step 3: Persist as draft
    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'saving_draft',
      message: 'Salvando rascunho do standup',
    })

    const record = yield* Result.await(
      withSpan('standup.persist', { 'standup.mode': runMode }, () =>
        saveGeneratedStandup(standupRepo, options, {
          date: today,
          meetingType,
          content: generated.content,
          sourceData: JSON.stringify(gitActivity),
        }),
      ),
    )

    jobLogger.info('Standup draft saved', { standupId: record.id })

    // Step 4: Notify discord-bot — non-fatal.
    // Worker não sabe nada sobre Discord. O standup está salvo;
    // o bot decide como apresentar ao usuário.
    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'notifying_review',
      message: 'Enviando standup para revisao',
      standupId: record.id,
    })

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

    await emitProgressEvent(env, {
      userId: options.userId,
      runId,
      date: today,
      mode: runMode,
      step: 'completed',
      message: 'Standup pronto para revisao',
      standupId: record.id,
    })

    await notifyStandupEvent({
      apiInternalUrl: env.API_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
      event: {
        type: 'standup_generated',
        userId: options.userId,
        runId,
        standupId: record.id,
        date: today,
        mode: runMode,
      },
    })

    return Result.ok(record.id)
  })

  // ---------------------------------------------------------------------------
  // Finalização: libera lock + notifica falha (Padrão 6 do Akita)
  // ---------------------------------------------------------------------------

  if (result.isErr()) {
    jobLogger.error('Standup job failed', { error: result.error.message })

    await notifyStandupEvent({
      apiInternalUrl: env.API_INTERNAL_URL,
      internalSecret: env.INTERNAL_SECRET,
      event: {
        type: 'standup_failed',
        userId: options.userId,
        runId,
        date: today,
        mode: runMode,
        message: result.error.message,
      },
    })

    await jobRunRepo.releaseLock(runId, 'failed', result.error.message)

    // Padrão 8 do Akita: notificar falha no canal Discord para visibilidade imediata.
    // Non-fatal: se o bot não estiver disponível, o erro já foi logado acima.
    const failNotifyResult = await notifyJobFailed({
      botInternalUrl: env.BOT_INTERNAL_URL,
      secret: env.INTERNAL_SECRET,
      error: result.error.message,
      context: 'standup-job',
      discordUserId: options.discordUserId,
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
