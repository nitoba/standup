import type { AzureMcpClient } from '@standup/azure-devops'
import type { WorkerEnv } from '@standup/config'
import type { StandupRepository } from '@standup/db'
import { DbError, NotFoundError, Result } from '@standup/domain'
import type { createServiceLogger } from '@standup/logger'
import { notifyStandupEvent } from '../../notifications/notify-standup-event.js'
import { notifyStandupReady } from '../../notifications/notify-standup-ready.js'
import { notifyUserDm } from '../../notifications/notify-user-dm.js'
import { executeAdjustStrategy } from './strategies/adjust.js'
import { executeGenerateStrategy } from './strategies/generate.js'
import { executeRegenerateStrategy } from './strategies/regenerate.js'
import type {
  StandupJobOptions,
  StandupRunMode,
  StrategyProgressUpdate,
} from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'

const DM_COLORS = {
  INFO: 0x3498db,
  WARNING: 0xf39c12,
} as const

export interface PipelineContext {
  env: WorkerEnv
  options: StandupJobOptions
  runId: string
  today: string
  runMode: StandupRunMode
  standupRepo: StandupRepository
  mcpClient?: AzureMcpClient
  jobLogger: ReturnType<typeof createServiceLogger>
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Executes the full standup pipeline:
 *  1. Selects and runs the appropriate strategy (generate / regenerate / adjust)
 *  2. Handles the no-activity path
 *  3. Persists the generated standup as a draft
 *  4. Notifies the Discord bot and emits events
 *
 * Returns the saved standup ID on success, null if there was no git activity.
 */
export async function executePipeline(
  ctx: PipelineContext,
): Promise<Result<string | null, Error>> {
  const { env, options, runId, today, runMode, standupRepo, jobLogger } = ctx

  await emitProgress(env, {
    ...ctx,
    step: 'queued',
    message: 'Geracao do standup iniciada',
  })

  // 1. Execute the correct strategy
  const strategyResult = await runStrategy(runMode, ctx)
  if (strategyResult.isErr()) return strategyResult

  const generated = strategyResult.value

  // 2. No activity — notify user and exit cleanly
  if (generated === null) {
    await emitProgress(env, {
      ...ctx,
      step: 'no_activity',
      message: 'Nenhuma atividade encontrada hoje',
    })
    if (options.discordUserId.trim()) {
      await notifyUserDm({
        botInternalUrl: env.BOT_INTERNAL_URL,
        secret: env.INTERNAL_SECRET,
        discordUserId: options.discordUserId,
        title: '🔍 Nenhuma atividade encontrada',
        message:
          'Não encontrei commits hoje nos repositórios configurados. Verifique suas configurações em `/standup settings`.',
        color: DM_COLORS.WARNING,
      }).catch(() => {
        /* non-fatal */
      })
    }
    return Result.ok(null)
  }

  // 3. Persist draft
  await emitProgress(env, {
    ...ctx,
    step: 'saving_draft',
    message: 'Salvando rascunho do standup',
  })

  const saveResult = await saveGeneratedStandup(standupRepo, options, {
    date: today,
    meetingType: generated.meetingType,
    content: generated.content,
    sourceData: generated.sourceData,
    replaceStandupId: generated.replaceStandupId,
  })

  if (saveResult.isErr()) return saveResult
  const { id: standupId } = saveResult.value

  jobLogger.info('Standup draft saved', { standupId })

  // 4. Notify bot (non-fatal)
  await emitProgress(env, {
    ...ctx,
    step: 'notifying_review',
    message: 'Enviando standup para revisao',
    standupId,
  })

  const notifyResult = await notifyStandupReady({
    botInternalUrl: env.BOT_INTERNAL_URL,
    standupId,
    discordUserId: options.discordUserId,
    secret: env.INTERNAL_SECRET,
  })

  if (notifyResult.isErr()) {
    jobLogger.error(
      'Failed to notify bot — standup saved, approve manually via API',
      {
        standupId,
        error: notifyResult.error.message,
      },
    )
  }

  // 5. Emit completed events
  await emitProgress(env, {
    ...ctx,
    step: 'completed',
    message: 'Standup pronto para revisao',
    standupId,
  })

  await notifyStandupEvent({
    apiInternalUrl: env.API_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
    event: {
      type: 'standup_generated',
      userId: options.userId,
      runId,
      standupId,
      date: today,
      mode: runMode,
    },
  })

  return Result.ok(standupId)
}

// ---------------------------------------------------------------------------
// Strategy dispatch
// ---------------------------------------------------------------------------

async function runStrategy(mode: StandupRunMode, pipelineCtx: PipelineContext) {
  const { env, options, runMode, standupRepo, today, mcpClient } = pipelineCtx
  const reportProgress = createStrategyProgressReporter(pipelineCtx)

  switch (mode) {
    case 'adjust':
      return executeAdjustStrategy({
        env,
        options,
        runMode,
        standupRepo,
        today,
        mcpClient,
        reportProgress,
      })

    case 'regenerate':
      return executeRegenerateStrategy({
        env,
        options,
        runMode,
        standupRepo,
        today,
        mcpClient,
        reportProgress,
      })

    case 'generate':
    default:
      return executeGenerateStrategy({
        env,
        options,
        runMode,
        standupRepo,
        today,
        mcpClient,
        reportProgress,
      })
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveGeneratedStandup(
  standupRepo: StandupRepository,
  options: StandupJobOptions,
  input: {
    date: string
    meetingType: string
    content: string
    sourceData: string
    replaceStandupId?: string
  },
): Promise<Result<{ id: string }, DbError | NotFoundError>> {
  const replaceId = input.replaceStandupId ?? options.replaceStandupId?.trim()

  if (replaceId) {
    return standupRepo.replaceGeneratedForUser(replaceId, options.userId, {
      meetingType: input.meetingType,
      content: input.content,
      sourceData: input.sourceData,
    })
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

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

async function emitProgress(
  env: WorkerEnv,
  ctx: PipelineContext & {
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
      userId: ctx.options.userId,
      runId: ctx.runId,
      date: ctx.today,
      mode: ctx.runMode,
      step: ctx.step,
      message: ctx.message,
      ...(ctx.standupId ? { standupId: ctx.standupId } : {}),
    },
  })
}

function createStrategyProgressReporter(ctx: PipelineContext) {
  return async ({ step, message }: StrategyProgressUpdate) =>
    emitProgress(ctx.env, {
      ...ctx,
      step,
      message,
    })
}
