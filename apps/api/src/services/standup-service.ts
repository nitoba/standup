import type { ListStandupFilters } from '@standup/db'
import { getDb, StandupRepository } from '@standup/db'
import type { StandupRecord, StandupStatus } from '@standup/domain'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
} from '@standup/domain'

export type StandupServiceError =
  | NotFoundError
  | InvalidStateTransitionError
  | DbError

export interface StandupServiceDeps {
  databaseUrl: string
}

/**
 * Lista standups com filtros opcionais, scoped por userId.
 */
export async function listStandups(
  filters: ListStandupFilters,
  deps: StandupServiceDeps,
): Promise<Result<StandupRecord[], DbError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  return repo.list(filters)
}

/**
 * Busca um standup pelo ID, com ownership check via userId.
 * Retorna NotFoundError se o standup não existir ou não pertencer ao usuário.
 */
export async function getStandupById(
  id: string,
  userId: string,
  deps: StandupServiceDeps,
): Promise<Result<StandupRecord, NotFoundError | DbError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  return repo.findByIdForUser(id, userId)
}

/**
 * Atualiza o status de um standup com ownership check.
 * A state machine em StandupRepository valida as transições permitidas.
 */
export async function updateStandupStatus(
  id: string,
  userId: string,
  status: StandupStatus,
  deps: StandupServiceDeps,
): Promise<Result<StandupRecord, StandupServiceError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  // Validate ownership first
  const found = await repo.findByIdForUser(id, userId)
  if (found.isErr()) return found
  return repo.updateStatus(id, status)
}
