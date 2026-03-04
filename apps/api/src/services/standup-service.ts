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
 * Lista standups com filtros opcionais.
 * Filtros são aplicados como OR (status ou date — apenas um por vez).
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
 * Busca um standup pelo ID.
 * Retorna NotFoundError se o standup não existir.
 */
export async function getStandupById(
  id: string,
  deps: StandupServiceDeps,
): Promise<Result<StandupRecord, NotFoundError | DbError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  return repo.findById(id)
}

/**
 * Atualiza o status de um standup.
 * A state machine em StandupRepository valida as transições permitidas.
 * Retorna InvalidStateTransitionError se a transição não for permitida.
 */
export async function updateStandupStatus(
  id: string,
  status: StandupStatus,
  deps: StandupServiceDeps,
): Promise<Result<StandupRecord, StandupServiceError>> {
  const db = getDb(deps.databaseUrl)
  const repo = new StandupRepository(db)
  return repo.updateStatus(id, status)
}
