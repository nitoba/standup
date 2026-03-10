import { getDb, StandupRepository } from '@standup/db'
import type { CustomEntries, StandupRecord } from '@standup/domain'
import {
  DbError,
  hasCustomEntries,
  InvalidStateTransitionError,
  mergeCustomEntries,
  NotFoundError,
  Result,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-approve-service',
})

export interface ApproveStandupDeps {
  databaseUrl: string
}

export type ApproveStandupOutcome =
  | { kind: 'success'; standup: StandupRecord }
  | { kind: 'invalid_transition'; error: InvalidStateTransitionError }
  | { kind: 'not_found'; error: NotFoundError }

function isOutcomeError(
  error: DbError | InvalidStateTransitionError | NotFoundError,
): error is InvalidStateTransitionError | NotFoundError {
  return InvalidStateTransitionError.is(error) || NotFoundError.is(error)
}

function toOutcome(
  error: DbError | InvalidStateTransitionError | NotFoundError,
): ApproveStandupOutcome | null {
  if (NotFoundError.is(error)) {
    return { kind: 'not_found', error }
  }

  if (InvalidStateTransitionError.is(error)) {
    return { kind: 'invalid_transition', error }
  }

  return null
}

async function persistMergedCustomEntries(
  repo: StandupRepository,
  standupId: string,
  userId: string,
  entries: CustomEntries,
): Promise<
  Result<StandupRecord, DbError | InvalidStateTransitionError | NotFoundError>
> {
  const saveEntriesResult = await repo.updateCustomEntriesForUser(
    standupId,
    userId,
    entries,
  )

  if (saveEntriesResult.isErr()) {
    return saveEntriesResult
  }

  const mergedContent = mergeCustomEntries(
    saveEntriesResult.value.content,
    saveEntriesResult.value.meetingType,
    entries,
  )

  return repo.updateContentForUser(standupId, userId, mergedContent)
}

/**
 * Browser-safe approve workflow.
 * Faz pending_review → approved no DB.
 * A publicação no Discord e a transição approved → published são feitas
 * pelo discord-bot quando recebe a notificação POST /internal/notify/standup-status-changed.
 */
export async function approveStandup(
  standupId: string,
  userId: string,
  deps: ApproveStandupDeps,
  customEntries?: CustomEntries | null,
): Promise<Result<ApproveStandupOutcome, DbError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)

  const found = await repo.findByIdForUser(standupId, userId)
  if (found.isErr()) {
    if (DbError.is(found.error)) {
      return Result.err(found.error)
    }

    const outcome = toOutcome(found.error)
    if (outcome) {
      return Result.ok(outcome)
    }
  }

  if (customEntries && hasCustomEntries(customEntries)) {
    const mergedResult = await persistMergedCustomEntries(
      repo,
      standupId,
      userId,
      customEntries,
    )

    if (mergedResult.isErr()) {
      if (DbError.is(mergedResult.error)) {
        return Result.err(mergedResult.error)
      }

      const outcome = toOutcome(mergedResult.error)
      if (outcome) {
        return Result.ok(outcome)
      }
    }
  }

  const approvedResult = await repo.updateStatusForUser(
    standupId,
    userId,
    'approved',
  )

  if (approvedResult.isErr()) {
    if (DbError.is(approvedResult.error)) {
      return Result.err(approvedResult.error)
    }

    const outcome = toOutcome(approvedResult.error)
    if (outcome) {
      return Result.ok(outcome)
    }

    return Result.err(
      new DbError({
        operation: 'approveStandup',
        message: approvedResult.error.message,
      }),
    )
  }

  logger.info(
    'Standup approved via web — bot will handle publish and DM update',
    {
      standupId,
      userId,
    },
  )

  return Result.ok({ kind: 'success', standup: approvedResult.value })
}

// Keep isOutcomeError exported for tests
export { isOutcomeError }
