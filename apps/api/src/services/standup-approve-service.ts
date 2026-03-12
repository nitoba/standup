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

export type ApproveStandupError =
  | NotFoundError
  | InvalidStateTransitionError
  | DbError

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
 * Faz pending_review -> approved no DB.
 * A publicacao no Discord e a transicao approved -> published sao feitas
 * pelo discord-bot quando recebe a notificacao POST /internal/notify/standup-status-changed.
 *
 * Returns errors in the Err channel (consistent with the rest of the service layer).
 */
export async function approveStandup(
  standupId: string,
  userId: string,
  deps: ApproveStandupDeps,
  customEntries?: CustomEntries | null,
): Promise<Result<StandupRecord, ApproveStandupError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)

  // Validate ownership
  const found = await repo.findByIdForUser(standupId, userId)
  if (found.isErr()) {
    return found
  }

  // Persist custom entries if provided
  if (customEntries && hasCustomEntries(customEntries)) {
    const mergedResult = await persistMergedCustomEntries(
      repo,
      standupId,
      userId,
      customEntries,
    )

    if (mergedResult.isErr()) {
      return mergedResult
    }
  }

  // Transition to approved
  const approvedResult = await repo.updateStatusForUser(
    standupId,
    userId,
    'approved',
  )

  if (approvedResult.isErr()) {
    return approvedResult
  }

  logger.info(
    'Standup approved via web — bot will handle publish and DM update',
    {
      standupId,
      userId,
    },
  )

  return Result.ok(approvedResult.value)
}
