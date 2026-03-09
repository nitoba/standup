import { getDb, StandupRepository } from '@standup/db'
import type {
  CustomEntries,
  ExternalServiceError,
  StandupRecord,
} from '@standup/domain'
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
  publishApprovedStandup: (
    record: StandupRecord,
  ) => Promise<Result<void, ExternalServiceError>>
}

export type ApproveStandupOutcome =
  | { kind: 'success'; standup: StandupRecord }
  | {
      kind: 'publish_failed'
      standup: StandupRecord
      error: ExternalServiceError
    }
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
 * Browser-safe approve workflow mirroring the Discord approve modal flow.
 * Ownership and state-machine validation stay in the repository layer.
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

  const approvedRecord = approvedResult.value

  const publishResult = await deps.publishApprovedStandup(approvedRecord)
  if (publishResult.isErr()) {
    logger.warn('Standup approved but publish failed', {
      standupId,
      userId,
      error: publishResult.error.message,
    })
    return Result.ok({
      kind: 'publish_failed',
      standup: approvedRecord,
      error: publishResult.error,
    })
  }

  const publishedResult = await repo.updateStatusForUser(
    standupId,
    userId,
    'published',
  )

  if (publishedResult.isErr()) {
    if (!isOutcomeError(publishedResult.error)) {
      logger.warn('Standup published to Discord but status stayed approved', {
        standupId,
        userId,
        operation: publishedResult.error.operation,
        message: publishedResult.error.message,
      })
    } else {
      logger.warn('Standup published to Discord but final transition failed', {
        standupId,
        userId,
        error: publishedResult.error.message,
      })
    }

    return Result.ok({ kind: 'success', standup: approvedRecord })
  }

  return Result.ok({ kind: 'success', standup: publishedResult.value })
}
